import Ajv2020, { type ErrorObject } from "ajv/dist/2020.js";
import implementationDataflowSchema from "../../impl-dataflow.schema.json";
import exampleImplementationDataflow from "../../impl-dataflow.example.json";
import type { DataflowNode, NodeType } from "../../types";
import { computeLayout } from "./layout";
import { filterGraph, type VisibleGraph } from "./filter";
import { dataflowEdges, relationshipsForEdge } from "./edges";
import { findUiPairs, linkPath } from "./pairing";
import { edgePortSpreads, routeCompositionEdge, routeEdge } from "./routing";
import { semanticError } from "./validation";
import "./styles.css";
import type { ChangeType, ContainerStatus, GraphContainer, GraphLayout, ImplementationDataflow, Rect, ResolvedEndpoint, ResolvedRelationship, Selection } from "./types";
import { edgeKey } from "./types";
import { droppedJsonFile, pickJsonFile, supportsJsonFileHandles, watchOpenedJson, type JsonFileHandle } from "../../../watch-opened-json.ts";

const app = document.querySelector<HTMLDivElement>("#app")!;
const ajv = new Ajv2020({ allErrors: true });
const validate = ajv.compile<ImplementationDataflow>(implementationDataflowSchema);
const measureContext = document.createElement("canvas").getContext("2d")!;
const LAST_OPENED_KEY = "impl-dataflow:last-opened";

const CHANGE_COLORS: Record<ChangeType, string> = {
  added: "oklch(0.76 0.16 155)",
  modified: "oklch(0.82 0.15 82)",
  deleted: "oklch(0.72 0.18 25)",
  unchanged: "oklch(0.56 0.02 250)",
};

const NODE_LABELS: Record<NodeType, string> = {
  function: "Function",
  "ui-component": "UI component",
  "system-input": "System input",
  "system-output": "System output",
  "external-dependency": "External dependency",
  "static-data": "Static data",
  "state-variable": "State variable",
};

const NODE_GLYPHS: Record<NodeType, string> = {
  function: "ƒ",
  "ui-component": "▣",
  "system-input": "→",
  "system-output": "←",
  "external-dependency": "⇅",
  "static-data": "◆",
  "state-variable": "s",
};

type Silhouette = "rect" | "dashed" | "stadium-left" | "stadium-right" | "dogear" | "hexagon";
type BoundaryKind = "user-input" | "user-output" | "external-dependency" | "system-input" | "system-output" | "static-data";

/** Boundary node looks: the type sets the silhouette, badge and tint; the change type sets the outline. */
const BOUNDARY_TYPES: Record<BoundaryKind, { label: string; badge: string; shape: Silhouette; color: string }> = {
  "user-input": { label: "UI read", badge: "USER →", shape: "rect", color: "oklch(0.80 0.095 232)" },
  "user-output": { label: "UI write", badge: "→ USER", shape: "rect", color: "oklch(0.78 0.095 300)" },
  "external-dependency": { label: "External dependency", badge: "EXTERNAL", shape: "dashed", color: "oklch(0.75 0.085 278)" },
  "system-input": { label: "System input", badge: "SYSTEM →", shape: "stadium-left", color: "oklch(0.80 0.085 205)" },
  "system-output": { label: "System output", badge: "→ SYSTEM", shape: "stadium-right", color: "oklch(0.76 0.095 325)" },
  "static-data": { label: "Static data", badge: "STATIC", shape: "dogear", color: "oklch(0.71 0.03 250)" },
};

/** Containers use a hexagon in their type color. */
const CONTAINER_TYPE = { badge: { class: "CLASS", module: "MODULE" }, shape: "hexagon" as Silhouette, color: "oklch(0.85 0.09 255)" };

function boundaryKind(type: NodeType, uiDirection: "read" | "write" | undefined): BoundaryKind {
  if (type === "ui-component") {
    return uiDirection === "write" ? "user-output" : "user-input";
  }
  return type as BoundaryKind;
}

/** Outline and detail strokes for a boundary node. */
function silhouette(shape: Silhouette, width: number, height: number): { outline: string; details: string[]; dashed: boolean } {
  const round = (value: number): number => Math.round(value * 100) / 100;
  const half = round(height / 2);
  const inset = round(height * 0.076);
  const cut = round(height * 0.239);
  function roundedRect(radius: number): string {
    const r = round(radius);
    return `M ${r} 0 L ${width - r} 0 A ${r} ${r} 0 0 1 ${width} ${r} L ${width} ${height - r} A ${r} ${r} 0 0 1 ${width - r} ${height} L ${r} ${height} A ${r} ${r} 0 0 1 0 ${height - r} L 0 ${r} A ${r} ${r} 0 0 1 ${r} 0 Z`;
  }
  const stadium = `M ${half} 0 L ${width - half} 0 A ${half} ${half} 0 0 1 ${width - half} ${height} L ${half} ${height} A ${half} ${half} 0 0 1 ${half} 0 Z`;
  const innerCap = round(half - inset);
  if (shape === "stadium-left") {
    return { outline: stadium, details: [`M ${half} ${inset} A ${innerCap} ${innerCap} 0 0 0 ${half} ${height - inset}`], dashed: false };
  } else if (shape === "stadium-right") {
    return { outline: stadium, details: [`M ${width - half} ${inset} A ${innerCap} ${innerCap} 0 0 1 ${width - half} ${height - inset}`], dashed: false };
  } else if (shape === "dogear") {
    const r = round(height * 0.109);
    return {
      outline: `M ${r} 0 L ${width - cut} 0 L ${width} ${cut} L ${width} ${height - r} A ${r} ${r} 0 0 1 ${width - r} ${height} L ${r} ${height} A ${r} ${r} 0 0 1 0 ${height - r} L 0 ${r} A ${r} ${r} 0 0 1 ${r} 0 Z`,
      details: [`M ${width - cut} 0 L ${width - cut} ${cut} L ${width} ${cut}`],
      dashed: false,
    };
  } else if (shape === "hexagon") {
    const chamfer = Math.min(round(width * 0.0806), half);
    return { outline: `M ${chamfer} 0 L ${width - chamfer} 0 L ${width} ${half} L ${width - chamfer} ${height} L ${chamfer} ${height} L 0 ${half} Z`, details: [], dashed: false };
  } else if (shape === "dashed") {
    return { outline: roundedRect(height * 0.152), details: [], dashed: true };
  } else {
    return { outline: roundedRect(height * 0.13), details: [], dashed: false };
  }
}

let implementationDataflow = exampleImplementationDataflow as ImplementationDataflow;
let fileName = "impl-dataflow.example.json";
let showUnchanged = false;
let hideInitialization = true;
let functionsHidden = false;
let zoom = 1;
let panX = 0;
let panY = 0;
let inspectorWidth = 356;
let currentGraphWidth = 320;
let currentGraphHeight = 240;
let graphLayout: GraphLayout;
let userZoomed = false;
let selection: Selection | undefined;
let hovered: Selection | undefined;
let statusMessage = "";
let dragDepth = 0;
let openedRepositoryFile: string | undefined;
let stopWatchingOpenedFile: (() => void) | undefined;

function escapeHtml(value: string | number): string {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

type DisplayChangeType = ChangeType | ContainerStatus | "missing-from-cr";

function nodeChangeType(node: DataflowNode): ChangeType | "missing-from-cr" {
  return node.type === "function" && node.subtype === "missing-from-cr" ? node.subtype : node.changeType;
}

function changeColor(changeType: DisplayChangeType): string {
  return changeType === "missing-from-cr" ? "oklch(0.75 0.15 300)" : CHANGE_COLORS[changeType === "new" ? "added" : changeType === "changed" ? "modified" : changeType];
}

function chipStyle(changeType: DisplayChangeType): string {
  return `color:${changeColor(changeType)};background:color-mix(in oklch, ${changeColor(changeType)} 15%, transparent)`;
}

const MISMATCH_GLYPH = '<span class="hld-mismatch-glyph" aria-hidden="true">≠</span>';

function mismatchBadge(mismatch: boolean): string {
  return mismatch
    ? `<span class="hld-mismatch" title="Function change does not match the HLD">${MISMATCH_GLYPH}HLD mismatch</span>`
    : "";
}

function diffEvidence(ids: string[] | undefined): string {
  if (ids === undefined || ids.length === 0) {
    return "";
  } else {
    const hunks = ids.map((id) => implementationDataflow.diffHunks!.find((hunk) => hunk.id === id)!);
    return section("Relevant diff", hunks.map((hunk) =>
      `<details class="diff-evidence"><summary>${escapeHtml(hunk.file)} · ${escapeHtml(hunk.patch.split("\n")[0])}</summary><pre>${escapeHtml(hunk.patch)}</pre></details>`,
    ).join(""), hunks.length);
  }
}

function functionWidth(name: string, writesState: boolean, mismatch = false): number {
  measureContext.font = "500 12.5px IBM Plex Mono, monospace";
  return Math.ceil(measureContext.measureText(name).width) + (writesState ? 57 : 42) + (mismatch ? 6 : 0);
}

function stateVariableWidth(name: string): number {
  measureContext.font = "500 12px IBM Plex Mono, monospace";
  return Math.ceil(measureContext.measureText(name).width) + 56;
}

function componentWidth(name: string): number {
  measureContext.font = "500 12.5px IBM Plex Sans, sans-serif";
  return Math.ceil(measureContext.measureText(name).width);
}

function tabWidth(container: GraphContainer): number {
  measureContext.font = "600 11.5px IBM Plex Mono, monospace";
  return Math.ceil(measureContext.measureText(container.name).width) + (container.type === "module" ? 92 : 42);
}

function endpointBoxLabel(endpoint: ResolvedEndpoint): string {
  return endpoint.boxId === endpoint.nodeId || endpoint.type === "ui-component"
    ? implementationDataflow.nodes.find((node) => node.id === endpoint.nodeId)!.name
    : implementationDataflow.containers.find((container) => container.id === endpoint.boxId)!.name;
}

function endpointLabel(endpoint: ResolvedEndpoint): string {
  let label = endpointBoxLabel(endpoint);
  if (endpoint.nodeId !== undefined && endpoint.nodeId !== endpoint.boxId && endpoint.type !== "ui-component") {
    label += `.${implementationDataflow.nodes.find((node) => node.id === endpoint.nodeId)!.name}`;
  }
  return label;
}

function selectionForEndpoint(endpoint: ResolvedEndpoint): Selection {
  return endpoint.nodeId === undefined ? { type: "container", containerId: endpoint.boxId } : { type: "node", nodeId: endpoint.nodeId };
}

function selectionKey(value: Selection | undefined): string {
  return value === undefined ? "" : JSON.stringify(value);
}

function endpointMatches(endpoint: ResolvedEndpoint, value: Selection): boolean {
  let matches = false;
  if (value.type === "node") {
    matches = endpoint.nodeId === value.nodeId;
  } else if (value.type === "container") {
    matches = endpoint.boxId === value.containerId;
  }
  return matches;
}

function relationshipMatches(relationship: ResolvedRelationship, value: Selection | undefined, selectedRelationships: ResolvedRelationship[]): boolean {
  let matches = false;
  if (value?.type === "relationship") {
    matches = selectedRelationships.includes(relationship);
  } else if (value !== undefined) {
    matches = endpointMatches(relationship.from, value) || endpointMatches(relationship.to, value);
  }
  return matches;
}

function graphFocus(value: Selection | undefined): Selection | undefined {
  let focus = value;
  if (functionsHidden && value?.type === "node") {
    const node = implementationDataflow.nodes.find((node) => node.id === value.nodeId)!;
    if ((node.type === "function" && node.subtype !== "missing-from-cr") || node.type === "state-variable") {
      focus = { type: "container", containerId: node.containerId };
    }
  }
  return focus;
}

function relationshipAttributes(relationship: ResolvedRelationship, key = edgeKey(relationship, functionsHidden)): string {
  return `data-relation data-edge="${escapeHtml(key)}" data-from-box="${escapeHtml(relationship.from.boxId)}" data-from-node-id="${escapeHtml(relationship.from.nodeId ?? "")}" data-from-type="${relationship.from.type}" data-to-box="${escapeHtml(relationship.to.boxId)}" data-to-node-id="${escapeHtml(relationship.to.nodeId ?? "")}" data-to-type="${relationship.to.type}"`;
}

function visibleGraph(): VisibleGraph {
  return filterGraph(implementationDataflow, showUnchanged, hideInitialization);
}

function graphRect(endpoint: ResolvedEndpoint, boxes: Map<string, Rect>, memberRects: Map<string, Rect>): Rect | undefined {
  return !functionsHidden && endpoint.nodeId !== undefined && endpoint.nodeId !== endpoint.boxId && endpoint.type !== "ui-component"
    ? memberRects.get(endpoint.nodeId)
    : boxes.get(endpoint.boxId);
}

function graphEndpointKey(endpoint: ResolvedEndpoint): string {
  return functionsHidden || endpoint.type === "ui-component" ? endpoint.boxId : endpoint.nodeId ?? endpoint.boxId;
}

function classTargetRect(container: GraphContainer, box: Rect): Rect {
  return { x: box.x + 10, y: box.y - 12, width: tabWidth(container), height: 24 };
}

function renderMarkers(): string {
  const changeMarkers = (Object.keys(CHANGE_COLORS) as ChangeType[])
    .map(
      (changeType) => `
        <marker id="arrow-${changeType}" viewBox="0 0 8 8" refX="7" refY="4" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
          <path d="M 0 1 L 7 4 L 0 7 z" fill="${changeColor(changeType)}"></path>
        </marker>`,
    )
    .join("");
  return `${changeMarkers}
    <marker id="composition-arrow" viewBox="0 0 8 8" refX="7" refY="4" markerWidth="16" markerHeight="16" markerUnits="userSpaceOnUse" orient="auto">
      <path d="M 0 0 L 7 4 L 0 8 z" fill="oklch(0.305 0.032 255)"></path>
    </marker>`;
}

function renderGraph(graph: VisibleGraph): string {
  const stateWriters = new Set(graph.relationships.filter((relationship) => relationship.to.type === "state-variable" && relationship.from.type === "function").map((relationship) => relationship.from.nodeId!));
  const layout = computeLayout(graph.nodes, graph.relationships, functionsHidden, functionWidth, stateVariableWidth, componentWidth, stateWriters, graph.missingFunctions);
  graphLayout = layout;
  currentGraphWidth = layout.width;
  currentGraphHeight = layout.height;
  const pairsByBox = new Map(findUiPairs(graph.components).flatMap((pair) => [[pair.read.id, pair], [pair.write.id, pair]] as const));
  const containers = new Map(graph.containers.map((container) => [container.id, container]));
  const routingBounds = new Map(graph.nodes.map((node): [string, Rect] => {
    const box = layout.boxes.get(node.id)!;
    let bounds = box;
    if (!functionsHidden && node.nodeType === undefined) {
      const tab = classTargetRect(containers.get(node.id)!, box);
      bounds = { x: box.x, y: tab.y, width: Math.max(box.width, tab.x + tab.width - box.x), height: box.y + box.height - tab.y };
    }
    return [node.id, bounds];
  }));
  function obstaclesFor(relationship: ResolvedRelationship): Rect[] {
    return [...routingBounds].filter(([id]) => id !== relationship.from.boxId && id !== relationship.to.boxId).map(([, box]) => box);
  }

  const classFrames = functionsHidden ? "" : graph.containers.map((container) => {
    const box = layout.boxes.get(container.id)!;
    return `<rect class="class-frame" data-node="${escapeHtml(container.id)}" x="${box.x}" y="${box.y}" width="${box.width}" height="${box.height}" rx="11" fill="oklch(0.212 0.024 255 / 0.72)" stroke="oklch(0.4 0.032 255)" stroke-width="1.25" stroke-dasharray="6 5"></rect>`;
  }).join("");

  const compositionEdges = layout.compositionRelationships.map((relationship) => {
    const path = routeCompositionEdge(routingBounds.get(relationship.from.boxId)!, routingBounds.get(relationship.to.boxId)!, obstaclesFor(relationship));
    return `<path class="edge" ${relationshipAttributes(relationship)} d="${path}" fill="none" stroke="oklch(0.305 0.032 255)" stroke-width="5" stroke-linecap="round" stroke-linejoin="round" marker-end="url(#composition-arrow)"></path>
      <path class="edge-hit" ${relationshipAttributes(relationship)} data-select="relationship" d="${path}" fill="none" stroke="transparent" stroke-width="12"></path>`;
  }).join("");

  const edgeLayouts = dataflowEdges(graph.relationships, functionsHidden).map((edge) => ({
    ...edge,
    from: graphRect(edge.forward.from, routingBounds, layout.memberRects)!,
    to: graphRect(edge.forward.to, routingBounds, layout.memberRects)!,
  }));
  const edgeSpreads = edgePortSpreads(edgeLayouts.map((edge) => ({ fromKey: graphEndpointKey(edge.forward.from), toKey: graphEndpointKey(edge.forward.to), from: edge.from, to: edge.to })));
  const returnArrows: string[] = [];
  const edges = edgeLayouts.map((edge, index) => {
    const { forward: relationship, back, key, from, to } = edge;
    const route = routeEdge(from, to, edgeSpreads[index], obstaclesFor(relationship));
    const changeType = relationship.relationship.changeType;
    const stateUpdate = relationship.to.type === "state-variable";
    const stateRead = relationship.from.type === "state-variable";
    const dash = stateUpdate || stateRead ? "7 4" : changeType === "deleted" ? "7 5" : "";
    const selected = selectionKey(selection) === selectionKey({ type: "relationship", edge: key });
    const tail = `<circle class="edge" ${relationshipAttributes(relationship, key)} cx="${route.start.x}" cy="${route.start.y}" r="3.5" fill="${changeColor(changeType)}" stroke="oklch(0.198 0.024 255)" stroke-width="1.5"></circle>`;
    if (back !== undefined) {
      returnArrows.push(`<path class="edge edge-return-arrow${selected ? " selected" : ""}" ${relationshipAttributes(relationship, key)} data-select="relationship" d="M -9.8 -4.2 L 0 0 L -9.8 4.2 z" transform="translate(${route.start.x} ${route.start.y}) rotate(${route.start.y === from.y ? 90 : -90})" fill="oklch(0.198 0.024 255)" stroke="${changeColor(back.relationship.changeType)}" stroke-width="1.6" stroke-linejoin="round"></path>`);
    }
    return `<path class="edge${selected ? " selected" : ""}" ${relationshipAttributes(relationship, key)} d="${route.path}" fill="none" stroke="${changeColor(changeType)}" stroke-width="${stateUpdate ? 1.75 : 1.6}" stroke-dasharray="${dash}" stroke-linecap="round" stroke-linejoin="round" marker-end="url(#arrow-${changeType})"></path>
      ${back === undefined ? tail : ""}
      <path class="edge-hit" ${relationshipAttributes(relationship, key)} data-select="relationship" d="${route.path}" fill="none" stroke="transparent" stroke-width="12" stroke-linecap="round" stroke-linejoin="round"></path>`;
  }).join("");

  const classTabs = graph.containers.map((container) => {
    const box = layout.boxes.get(container.id)!;
    const selected = selectionKey(selection) === selectionKey({ type: "container", containerId: container.id });
    const deleted = container.changeType === "deleted" ? " deleted" : "";
    const attributes = `data-select="container" data-node="${escapeHtml(container.id)}" data-container="${escapeHtml(container.id)}" aria-label="Inspect ${container.type} ${escapeHtml(container.name)}${functionsHidden && container.hldMismatch ? ", HLD mismatch" : ""}"`;
    const rect = functionsHidden ? { x: box.x, y: box.y, width: box.width, height: box.height } : classTargetRect(container, box);
    const form = silhouette(CONTAINER_TYPE.shape, rect.width, rect.height);
    const style = `left:${rect.x}px;top:${rect.y}px;width:${rect.width}px;height:${rect.height}px;--type-color:${CONTAINER_TYPE.color};--change-color:${changeColor(container.changeType)}`;
    const shape = `<svg class="node-shape" width="${rect.width}" height="${rect.height}" viewBox="0 0 ${rect.width} ${rect.height}" aria-hidden="true"><path class="node-outline" d="${form.outline}"></path></svg>`;
    if (functionsHidden) {
      return `<button class="graph-node boundary-node container-node${selected ? " selected" : ""}${deleted}" style="${style}" ${attributes}>
        ${shape}<span class="boundary-body">${container.hldMismatch
          ? `<span class="node-badge hld-mismatch-badge" title="A function change in this ${container.type} does not match the HLD">${CONTAINER_TYPE.badge[container.type]} · ≠ HLD</span>`
          : `<span class="node-badge">${CONTAINER_TYPE.badge[container.type]}</span>`}<span class="component-name">${escapeHtml(container.name)}</span></span>
      </button>`;
    } else {
      return `<button class="graph-node boundary-node class-tab${selected ? " selected" : ""}${deleted}" style="${style}" ${attributes}>
        ${shape}<span class="boundary-body"><span class="class-name">${escapeHtml(container.name)}</span>${container.type === "module" ? '<span class="container-kind">module</span>' : ""}</span>
      </button>`;
    }
  }).join("");

  const members = functionsHidden ? "" : graph.containers.flatMap((container) => container.functions.map((node) => {
    const rect = layout.memberRects.get(node.id)!;
    const selected = selectionKey(selection) === selectionKey({ type: "node", nodeId: node.id });
    const mismatch = node["hld-change-mismatch"] === true;
    return `<button class="graph-node function-pill${selected ? " selected" : ""}${nodeChangeType(node) === "deleted" ? " deleted" : ""}${mismatch ? " hld-mismatch-pill" : ""}" style="left:${rect.x}px;top:${rect.y}px;width:${rect.width}px;--change-color:${changeColor(nodeChangeType(node))}" data-select="node" data-node="${escapeHtml(container.id)}" data-node-id="${escapeHtml(node.id)}" aria-label="Inspect ${NODE_LABELS[node.type]} ${escapeHtml(container.name)}.${escapeHtml(node.name)}${mismatch ? ", HLD mismatch" : ""}">
      ${mismatch ? '<span class="hld-mismatch-glyph" title="Function change does not match the HLD">≠</span>' : `<span class="function-glyph">${NODE_GLYPHS[node.type]}</span>`}<span class="function-name">${escapeHtml(node.name)}</span>
      ${stateWriters.has(node.id) ? '<span class="state-glyph" title="Writes state">◈</span>' : ""}
    </button>`;
  })).join("");

  const missingFunctions = graph.missingFunctions.map((node) => {
    const rect = layout.missingFunctionRects.get(node.id)!;
    const owner = implementationDataflow.containers.find((container) => container.id === node.containerId)!;
    const selected = selectionKey(selection) === selectionKey({ type: "node", nodeId: node.id });
    return `<button class="graph-node missing-function${selected ? " selected" : ""}" style="left:${rect.x}px;top:${rect.y}px;width:${rect.width}px;height:${rect.height}px" data-select="node" data-node="${escapeHtml(node.containerId)}" data-node-id="${escapeHtml(node.id)}" aria-label="Inspect missing function ${escapeHtml(owner.name)}.${escapeHtml(node.name)}">
      <span class="missing-function-name" title="${escapeHtml(owner.name)}.${escapeHtml(node.name)}">${escapeHtml(owner.name)}.${escapeHtml(node.name)}</span>
      <span class="missing-function-source" title="${escapeHtml(node.sourceFile)}">${escapeHtml(node.sourceFile)}</span>
      <span class="missing-function-status">Expected: ${node.changeType}</span>
    </button>`;
  }).join("");

  const stateBoxes = graph.containers.filter((container) => !functionsHidden && container.stateVariables.length > 0).map((container) => {
    const rect = layout.stateRects.get(container.id)!;
    const variables = container.stateVariables.map((node) => {
      const selected = selectionKey(selection) === selectionKey({ type: "node", nodeId: node.id });
      return `<button class="graph-node state-variable-row${selected ? " selected" : ""}${node.changeType === "deleted" ? " deleted" : ""}" style="--change-color:${changeColor(node.changeType)}" data-select="node" data-node="${escapeHtml(container.id)}" data-node-id="${escapeHtml(node.id)}" aria-label="Inspect state variable ${escapeHtml(container.name)}.${escapeHtml(node.name)}">
        <span class="state-variable-name">${escapeHtml(node.name)}</span>
      </button>`;
    }).join("");
    return `<div class="graph-node class-state-box" style="left:${rect.x}px;top:${rect.y}px;width:${rect.width}px;height:${rect.height}px" data-node="${escapeHtml(container.id)}"><span class="state-box-glyph" title="State variables">s</span><div class="state-variable-list">${variables}</div></div>`;
  }).join("");

  const standaloneNodes = [...graph.components, ...graph.staticData].map((node) => {
    const box = layout.boxes.get(node.id)!;
    const nodeId = "nodeId" in node ? node.nodeId : node.id;
    const uiDirection = "uiDirection" in node ? node.uiDirection : undefined;
    const kind = BOUNDARY_TYPES[boundaryKind(node.type, uiDirection)];
    const form = silhouette(kind.shape, box.width, box.height);
    const details = form.details.map((detail) => `<path class="node-detail" d="${detail}"></path>`).join("");
    const selected = selectionKey(selection) === selectionKey({ type: "node", nodeId });
    const pair = pairsByBox.get(node.id);
    const pairingLabel = pair === undefined ? "" : `, paired with UI ${uiDirection === "read" ? "write" : "read"}, pair ${pair.label}`;
    return `<button class="graph-node boundary-node${selected ? " selected" : ""}${node.changeType === "deleted" ? " deleted" : ""}" style="left:${box.x}px;top:${box.y}px;width:${box.width}px;height:${box.height}px;--type-color:${kind.color};--change-color:${changeColor(node.changeType)}" data-select="node" data-node="${escapeHtml(node.id)}" data-node-id="${escapeHtml(nodeId)}" aria-label="Inspect ${kind.label} ${escapeHtml(node.name + pairingLabel)}">
      <svg class="node-shape" width="${box.width}" height="${box.height}" viewBox="0 0 ${box.width} ${box.height}" aria-hidden="true"><path class="node-outline" d="${form.outline}"${form.dashed ? ' stroke-dasharray="6 4"' : ""}></path>${details}</svg>
      <span class="boundary-body"><span class="node-badge">${kind.badge}</span><span class="component-name">${escapeHtml(node.name)}</span></span>
      ${pair === undefined ? "" : `<span class="pair-token" aria-hidden="true">${pair.label}</span>`}
    </button>`;
  }).join("");

  const emptyNotes = graph.containers.filter((container) => !functionsHidden && container.functions.length + container.stateVariables.length === 0).map((container) => {
    const box = layout.boxes.get(container.id)!;
    return `<span class="graph-node empty-class" data-node="${escapeHtml(container.id)}" style="left:${box.x + 15}px;top:${box.y + 30}px">No visible members</span>`;
  }).join("");

  queueMicrotask(() => fitGraph(layout.width, layout.height));
  return `<div class="graph-space">
    ${graph.nodes.length === 0 && graph.missingFunctions.length === 0 ? '<div class="empty-graph">No nodes match the current filters</div>' : ""}
    <div class="graph" style="left:calc(50% + ${panX}px);top:calc(50% + ${panY}px);width:${layout.width}px;height:${layout.height}px;transform:translate(-50%, -50%) scale(${zoom})">
      <svg class="graph-svg" width="${layout.width}" height="${layout.height}"><defs>${renderMarkers()}</defs>${classFrames}${compositionEdges}${edges}</svg>
      ${classTabs}${standaloneNodes}${members}${stateBoxes}${emptyNotes}
      ${graph.missingFunctions.length === 0 ? "" : `<div class="missing-functions-heading">Missing from CR <span>${graph.missingFunctions.length}</span><small>Function changes expected by the HLD</small></div>${missingFunctions}`}
      <svg class="graph-svg return-arrows" width="${layout.width}" height="${layout.height}">${returnArrows.join("")}</svg>
      <svg class="pair-link-layer" width="${layout.width}" height="${layout.height}" aria-hidden="true"></svg>
    </div>
  </div>`;
}

function flowRows(relationships: ResolvedRelationship[], endpoint: "from" | "to", state = false): string {
  if (relationships.length === 0) return '<p class="empty-copy">None</p>';
  return `<div class="flow-list">${relationships
    .map((relationship) => {
      const other = endpoint === "from" ? relationship.from : relationship.to;
      const selected = selectionForEndpoint(other);
      const { dataDescription, purpose, type } = relationship.relationship;
      return `<button class="flow-row${state ? " state" : ""}" style="border-color:${changeColor(relationship.relationship.changeType)}" data-jump="${escapeHtml(JSON.stringify(selected))}">
        <div class="flow-endpoint">${endpoint === "to" && !state ? "→ " : ""}${escapeHtml(endpointLabel(other))}</div>
        <div class="flow-label">${escapeHtml(dataDescription ?? type)}</div>
        ${purpose === undefined ? "" : `<div class="flow-purpose">${escapeHtml(purpose)}</div>`}
      </button>`;
    })
    .join("")}</div>`;
}

function section(title: string, content: string, count?: number): string {
  return `<section class="inspector-section"><div class="section-heading"><span>${escapeHtml(title)}</span>${count === undefined ? "" : `<span class="inspector-count">${count}</span>`}</div>${content}</section>`;
}

function inspectorHeader(eyebrow: string, title: string, changeType: DisplayChangeType, detail?: string): string {
  return `<header class="inspector-header">
    <div class="inspector-eyebrow">${escapeHtml(eyebrow)}</div>
    <div class="inspector-title-row"><div class="inspector-title">${escapeHtml(title)}</div><button class="close-button" data-close aria-label="Clear selection">✕</button></div>
    <span class="change-chip" style="${chipStyle(changeType)}">${changeType === "missing-from-cr" ? "Missing from CR" : changeType}</span>${detail === undefined ? "" : `<span class="change-chip neutral">${escapeHtml(detail)}</span>`}
  </header>`;
}

function nodeRows(nodes: DataflowNode[]): string {
  return nodes.length === 0 ? '<p class="empty-copy">None</p>' : `<div class="function-list">${nodes.map((node) => `<button class="function-row" style="border-color:${changeColor(nodeChangeType(node))}" data-jump="${escapeHtml(JSON.stringify({ type: "node", nodeId: node.id }))}"><div class="flow-endpoint">${escapeHtml(node.name)}</div><div class="flow-label">${node.type === "function" && node.subtype === "missing-from-cr" ? `Expected: ${node.changeType}` : node.changeType}</div>${mismatchBadge(node.type === "function" && node["hld-change-mismatch"] === true)}</button>`).join("")}</div>`;
}

function renderInspector(graph: VisibleGraph): string {
  const inspected = hovered ?? selection;
  let content = "";
  if (inspected === undefined) {
    const stateUpdates = graph.relationships.filter((relationship) => relationship.to.type === "state-variable");
    const containers = graph.containers.map((container) => `<button class="function-row" data-jump="${escapeHtml(JSON.stringify({ type: "container", containerId: container.id }))}"><div class="flow-endpoint">${escapeHtml(container.name)}</div><div class="flow-label">${container.functions.length} functions · ${container.stateVariables.length} state variables · ${container.staticData.length} static data</div></button>`).join("");
    content = `${section("Containers", containers || '<p class="empty-copy">None</p>', graph.containers.length)}${section("State updates", flowRows(stateUpdates, "from", true), stateUpdates.length)}`;
    if (graph.missingFunctions.length > 0) content += section("Missing from CR", nodeRows(graph.missingFunctions), graph.missingFunctions.length);
  } else if (inspected.type === "node") {
    const node = implementationDataflow.nodes.find((node) => node.id === inspected.nodeId)!;
    const inputs = graph.relationships.filter((relationship) => relationship.relationship.type === "dataflow" && endpointMatches(relationship.to, inspected));
    const outputs = graph.relationships.filter((relationship) => relationship.relationship.type === "dataflow" && endpointMatches(relationship.from, inspected));
    content = `${inspectorHeader(NODE_LABELS[node.type], node.name, nodeChangeType(node), node.type === "function" && node.subtype === "missing-from-cr" ? `Expected: ${node.changeType}` : undefined)}${diffEvidence(node.diffHunkIds)}${node.description === undefined ? "" : section("Description", `<p class="component-description">${escapeHtml(node.description)}</p>`)}`;
    if (node.type === "function") {
      content += section("Source file", `<p class="component-description">${escapeHtml(node.sourceFile)}</p>`);
      if (node["hld-change-mismatch"] === true) {
        let hldStatus: string;
        if (node.subtype === "missing-from-cr") {
          hldStatus = node.changeType;
        } else if (node.hldChangeType === null) {
          hldStatus = "Absent from HLD";
        } else if (node.hldChangeType !== undefined) {
          hldStatus = node.hldChangeType;
        } else {
          hldStatus = "Unavailable";
        }
        const crStatus = node.subtype === "missing-from-cr" ? "Missing from CR" : node.changeType;
        content += section("HLD comparison", `<div class="hld-comparison">${mismatchBadge(node["hld-change-mismatch"] === true)}<p>HLD: <strong>${hldStatus}</strong></p><p>CR: <strong>${crStatus}</strong></p></div>`);
      }
    }
    if ("containerId" in node && node.containerId !== undefined) {
      const owner = implementationDataflow.containers.find((container) => container.id === node.containerId)!;
      if (graph.containers.some((container) => container.id === owner.id)) {
        content += section("Container", `<button class="function-row" data-jump="${escapeHtml(JSON.stringify({ type: "container", containerId: owner.id }))}"><div class="flow-endpoint">${escapeHtml(owner.name)}</div><div class="flow-label">${owner.type}</div></button>`);
      } else {
        content += section("Container", `<div class="function-row"><div class="flow-endpoint">${escapeHtml(owner.name)}</div><div class="flow-label">${owner.type}</div></div>`);
      }
    }
    if (node.type === "function" && node.subtype !== "missing-from-cr") {
      const writes = outputs.filter((relationship) => relationship.to.type === "state-variable");
      const transfers = outputs.filter((relationship) => relationship.to.type !== "state-variable");
      content += `${section("Data in", flowRows(inputs, "from"), inputs.length)}${section("Data out", flowRows(transfers, "to"), transfers.length)}${section("State written", flowRows(writes, "to", true), writes.length)}`;
    } else if (node.type === "state-variable") {
      content += `${section("Read by", flowRows(outputs, "to"), outputs.length)}${section("Written by", flowRows(inputs, "from", true), inputs.length)}`;
    } else if (node.type === "static-data") {
      content += section("Read by", flowRows(outputs, "to"), outputs.length);
    } else if (["ui-component", "system-input", "system-output", "external-dependency"].includes(node.type)) {
      content += `${section("Data in", flowRows(inputs, "from"), inputs.length)}${section("Data out", flowRows(outputs, "to"), outputs.length)}`;
    }
  } else if (inspected.type === "container") {
    const container = graph.containers.find((container) => container.id === inspected.containerId)!;
    const writes = graph.relationships.filter((relationship) => relationship.to.type === "state-variable" && relationship.to.boxId === container.id);
    content = `${inspectorHeader(container.type === "class" ? "Class" : "Module", container.name, container.changeType)}${diffEvidence(container.diffHunkIds)}${section("Functions", nodeRows(container.functions), container.functions.length)}${section("State variables", nodeRows(container.stateVariables), container.stateVariables.length)}${section("Static data", nodeRows(container.staticData), container.staticData.length)}${section("State written by", flowRows(writes, "from", true), writes.length)}`;
  } else if (inspected.type === "relationship") {
    const edges = relationshipsForEdge(graph.relationships, inspected.edge, functionsHidden);
    if (edges.length === 0) {
      content = `${inspectorHeader("Relationship", "Not visible", "unchanged")}<p class="empty-copy">The current filters hide this relationship.</p>`;
    } else {
      const first = edges[0];
      const merged = edges.length > 1;
      const arrow = first.relationship.type === "composition" ? "owns" : first.to.type === "state-variable" ? "↝" : first.from.type === "state-variable" ? "⇢" : "→";
      const title = merged && functionsHidden ? `${endpointBoxLabel(first.from)} → ${endpointBoxLabel(first.to)}` : `${endpointLabel(first.from)} ${arrow} ${endpointLabel(first.to)}`;
      const eyebrow = merged ? "Merged relationships" : first.relationship.type === "composition" ? "Composition" : first.to.type === "state-variable" ? "State update" : first.from.type === "state-variable" ? "State read" : "Dataflow";
      const entries = edges.map((item) => `<div class="relationship-entry" style="border-color:${changeColor(item.relationship.changeType)}">${merged ? `<button class="entry-endpoints" data-jump="${escapeHtml(JSON.stringify(selectionForEndpoint(item.to)))}">${escapeHtml(endpointLabel(item.from))} → ${escapeHtml(endpointLabel(item.to))}</button><div class="entry-chips"><span class="change-chip" style="${chipStyle(item.relationship.changeType)}">${item.relationship.changeType}</span>${item.relationship.type === "dataflow" && item.relationship.transferType !== undefined ? `<span class="change-chip neutral">${item.relationship.transferType}</span>` : ""}</div>` : ""}${item.relationship.type === "dataflow" ? `<div class="entry-heading">Data</div><p class="entry-copy">${escapeHtml(item.relationship.dataDescription)}</p><div class="entry-heading">Purpose</div><p class="entry-copy">${escapeHtml(item.relationship.purpose)}</p>` : `<p class="entry-copy">${escapeHtml(endpointLabel(item.from))} owns instances of ${escapeHtml(endpointLabel(item.to))}.</p>`}</div>`).join("");
      content = `${inspectorHeader(eyebrow, title, first.relationship.changeType, merged ? `${edges.length} relationships` : first.relationship.type === "dataflow" ? first.relationship.transferType : undefined)}${diffEvidence([...new Set(edges.flatMap((edge) => edge.relationship.diffHunkIds ?? []))])}${section("Description", entries, merged ? edges.length : undefined)}`;
    }
  }
  return content;
}

function updateInspector(): void {
  app.querySelector<HTMLElement>(".inspector")!.innerHTML = renderInspector(visibleGraph());
}

function render(): void {
  const graph = visibleGraph();
  app.innerHTML = `<div class="app-shell">
    <header class="topbar">
      <div class="summary-row">
        <div class="brand"><span class="file-label" title="${escapeHtml(fileName)}">${escapeHtml(fileName)}</span><span class="stage-chip">${escapeHtml(implementationDataflow.stage)}</span></div>
        <div class="control-group">
          <button class="control-button open-button" data-open>Open JSON</button>
          <button class="control-button${showUnchanged ? "" : " active"}" data-toggle-unchanged>Hide unchanged</button>
          <button class="control-button${hideInitialization ? " active" : ""}" data-toggle-initialization aria-pressed="${hideInitialization}">Hide Initialization</button>
          <button class="control-button${functionsHidden ? " active" : ""}" data-toggle-functions>${functionsHidden ? "Expand containers" : "Collapse containers"}</button>
          <div class="zoom-controls"><button class="zoom-button" data-zoom-out aria-label="Zoom out">−</button><button class="zoom-button${userZoomed ? "" : " active"}" data-fit aria-pressed="${!userZoomed}">Fit · ${Math.round(zoom * 100)}%</button><button class="zoom-button" data-zoom-in aria-label="Zoom in">+</button></div>
        </div>
      </div>
    </header>
    <div class="workspace">
      <div class="canvas-wrap">
        <main class="canvas" aria-label="Implementation dataflow graph">${statusMessage === "" ? "" : `<div class="status-banner">${escapeHtml(statusMessage)}</div>`}${renderGraph(graph)}</main>
        <div class="change-legend">${(Object.keys(CHANGE_COLORS) as ChangeType[]).map((changeType) => `<div class="change-key"><span class="change-swatch" style="background:${changeColor(changeType)}"></span><span class="change-label">${changeType}</span></div>`).join("")}<div class="change-key"><span class="change-label">○ tail = data returns</span></div>${implementationDataflow.nodes.some((node) => node.type === "function" && node["hld-change-mismatch"] === true) ? `<div class="change-key">${MISMATCH_GLYPH}<span class="change-label">HLD mismatch</span></div>` : ""}</div>
        ${dragDepth > 0 ? '<div class="drop-overlay">Drop an impl-dataflow.json file</div>' : ""}
      </div>
      <div class="inspector-resizer" data-inspector-resizer role="separator" aria-label="Resize inspector" aria-orientation="vertical" aria-valuenow="${Math.round(inspectorWidth)}" tabindex="0"></div>
      <aside class="inspector" style="width:${inspectorWidth}px;flex-basis:${inspectorWidth}px" aria-label="Implementation dataflow inspector">${renderInspector(graph)}</aside>
    </div>
    <input type="file" accept="application/json,.json" data-file-input hidden>
  </div>`;
  bindEvents();
  updateGraphFocus(hovered ?? selection);
}

function bindEvents(): void {
  const canvas = app.querySelector<HTMLElement>(".canvas")!;
  const workspace = app.querySelector<HTMLElement>(".workspace")!;
  const inspectorResizer = app.querySelector<HTMLElement>("[data-inspector-resizer]")!;
  let rightDragPointer: number | undefined;
  let resizePointer: number | undefined;
  let dragStartX = 0;
  let dragStartY = 0;
  let dragStartPanX = 0;
  let dragStartPanY = 0;
  let resizeStartX = 0;
  let resizeStartWidth = 0;
  inspectorResizer.addEventListener("pointerdown", (event) => {
    if (event.button === 0) {
      resizePointer = event.pointerId;
      resizeStartX = event.clientX;
      resizeStartWidth = inspectorWidth;
      inspectorResizer.setPointerCapture(event.pointerId);
      workspace.classList.add("resizing-inspector");
      event.preventDefault();
    }
  });
  inspectorResizer.addEventListener("pointermove", (event) => {
    if (event.pointerId === resizePointer) {
      setInspectorWidth(resizeStartWidth - (event.clientX - resizeStartX));
    }
  });
  inspectorResizer.addEventListener("pointerup", (event) => {
    if (event.pointerId === resizePointer) {
      inspectorResizer.releasePointerCapture(event.pointerId);
      workspace.classList.remove("resizing-inspector");
      resizePointer = undefined;
    }
  });
  inspectorResizer.addEventListener("pointercancel", () => {
    workspace.classList.remove("resizing-inspector");
    resizePointer = undefined;
  });
  inspectorResizer.addEventListener("keydown", (event) => {
    if (event.key === "ArrowLeft") {
      setInspectorWidth(inspectorWidth + 16);
      event.preventDefault();
    } else if (event.key === "ArrowRight") {
      setInspectorWidth(inspectorWidth - 16);
      event.preventDefault();
    }
  });
  canvas.addEventListener("pointerdown", (event) => {
    if (event.button === 2) {
      rightDragPointer = event.pointerId;
      dragStartX = event.clientX;
      dragStartY = event.clientY;
      dragStartPanX = panX;
      dragStartPanY = panY;
      canvas.setPointerCapture(event.pointerId);
      canvas.classList.add("right-dragging");
      event.preventDefault();
    }
  });
  canvas.addEventListener("pointermove", (event) => {
    if (event.pointerId === rightDragPointer) {
      panX = dragStartPanX + event.clientX - dragStartX;
      panY = dragStartPanY + event.clientY - dragStartY;
      updateGraphTransform();
    }
  });
  canvas.addEventListener("pointerup", (event) => {
    if (event.pointerId === rightDragPointer) {
      canvas.releasePointerCapture(event.pointerId);
      canvas.classList.remove("right-dragging");
      rightDragPointer = undefined;
    }
  });
  canvas.addEventListener("pointercancel", () => {
    canvas.classList.remove("right-dragging");
    rightDragPointer = undefined;
  });
  canvas.addEventListener("contextmenu", (event) => event.preventDefault());
  canvas.addEventListener(
    "wheel",
    (event) => {
      const nextZoom = Math.min(1.4, Math.max(0.15, zoom * Math.exp(-event.deltaY * 0.0015)));
      if (nextZoom !== zoom) {
        const bounds = canvas.getBoundingClientRect();
        const pointerX = event.clientX - bounds.left - canvas.clientWidth / 2;
        const pointerY = event.clientY - bounds.top - canvas.clientHeight / 2;
        panX = pointerX - (nextZoom / zoom) * (pointerX - panX);
        panY = pointerY - (nextZoom / zoom) * (pointerY - panY);
        zoom = nextZoom;
        userZoomed = true;
        updateGraphTransform();
      }
      event.preventDefault();
    },
    { passive: false },
  );
  canvas.addEventListener("click", (event) => {
    if (event.target === canvas || (event.target as HTMLElement).classList.contains("graph-space")) {
      selection = undefined;
      render();
    }
  });
  for (const element of app.querySelectorAll<HTMLElement>("[data-select]")) {
    const target = (): Selection => {
      let targetSelection: Selection;
      if (element.dataset.select === "node") {
        targetSelection = { type: "node", nodeId: element.dataset.nodeId! };
      } else if (element.dataset.select === "container") {
        targetSelection = { type: "container", containerId: element.dataset.container! };
      } else if (element.dataset.select === "relationship") {
        targetSelection = { type: "relationship", edge: element.dataset.edge! };
      }
      return targetSelection!;
    };
    element.addEventListener("click", (event) => {
      event.stopPropagation();
      selection = target();
      render();
    });
    element.addEventListener("mouseenter", () => {
      hovered = target();
      updateGraphFocus(hovered);
      updateInspector();
    });
    element.addEventListener("mouseleave", () => {
      hovered = undefined;
      updateGraphFocus(selection);
      updateInspector();
    });
  }
  app.querySelector<HTMLElement>(".inspector")!.addEventListener("click", (event) => {
    const button = (event.target as HTMLElement).closest<HTMLElement>("[data-jump], [data-close]");
    if (button?.dataset.jump !== undefined) {
      selection = JSON.parse(button.dataset.jump) as Selection;
      render();
    } else if (button?.hasAttribute("data-close")) {
      selection = undefined;
      render();
    }
  });
  app.querySelector<HTMLElement>("[data-toggle-unchanged]")!.addEventListener("click", () => {
    showUnchanged = !showUnchanged;
    selection = undefined;
    hovered = undefined;
    panX = 0;
    panY = 0;
    userZoomed = false;
    render();
  });
  app.querySelector<HTMLElement>("[data-toggle-initialization]")!.addEventListener("click", () => {
    hideInitialization = !hideInitialization;
    selection = undefined;
    hovered = undefined;
    panX = 0;
    panY = 0;
    userZoomed = false;
    render();
  });
  app.querySelector<HTMLElement>("[data-toggle-functions]")!.addEventListener("click", () => {
    functionsHidden = !functionsHidden;
    if (selection?.type === "relationship") selection = undefined;
    hovered = undefined;
    panX = 0;
    panY = 0;
    userZoomed = false;
    render();
  });
  app.querySelector<HTMLElement>("[data-zoom-out]")!.addEventListener("click", () => setZoom(zoom - 0.1));
  app.querySelector<HTMLElement>("[data-zoom-in]")!.addEventListener("click", () => setZoom(zoom + 0.1));
  app.querySelector<HTMLElement>("[data-fit]")!.addEventListener("click", () => {
    panX = 0;
    panY = 0;
    userZoomed = false;
    render();
  });
  const input = app.querySelector<HTMLInputElement>("[data-file-input]")!;
  app.querySelector<HTMLElement>("[data-open]")!.addEventListener("click", () => {
    if (supportsJsonFileHandles()) {
      void pickJsonFile().then((opened) => {
        if (opened !== undefined) return openFile(opened.file, opened.handle);
      }).catch((error) => {
        statusMessage = `Could not open JSON: ${error instanceof Error ? error.message : String(error)}`;
        render();
      });
    } else {
      input.click();
    }
  });
  input.addEventListener("change", () => {
    const file = input.files?.[0];
    if (file !== undefined) void openFile(file);
  });
}

function setInspectorWidth(nextWidth: number): void {
  const workspace = app.querySelector<HTMLElement>(".workspace")!;
  inspectorWidth = Math.min(Math.max(240, workspace.clientWidth - 260), Math.max(240, nextWidth));
  const inspector = app.querySelector<HTMLElement>(".inspector")!;
  inspector.style.width = `${inspectorWidth}px`;
  inspector.style.flexBasis = `${inspectorWidth}px`;
  app.querySelector<HTMLElement>("[data-inspector-resizer]")!.setAttribute("aria-valuenow", String(Math.round(inspectorWidth)));
  fitGraph(currentGraphWidth, currentGraphHeight);
}

function updateGraphTransform(): void {
  const graph = app.querySelector<HTMLElement>(".graph");
  if (graph !== null) {
    graph.style.left = `calc(50% + ${panX}px)`;
    graph.style.top = `calc(50% + ${panY}px)`;
    graph.style.transform = `translate(-50%, -50%) scale(${zoom})`;
  }
  const fitButton = app.querySelector<HTMLElement>("[data-fit]")!;
  fitButton.textContent = `Fit · ${Math.round(zoom * 100)}%`;
  fitButton.classList.toggle("active", !userZoomed);
  fitButton.setAttribute("aria-pressed", String(!userZoomed));
}

function endpointDatasetMatches(element: HTMLElement | SVGElement, prefix: "from" | "to", value: Selection): boolean {
  return endpointMatches({
    boxId: element.getAttribute(`data-${prefix}-box`)!,
    nodeId: element.getAttribute(`data-${prefix}-node-id`) || undefined,
    type: element.getAttribute(`data-${prefix}-type`)! as ResolvedEndpoint["type"],
  }, value);
}

function updateGraphFocus(value: Selection | undefined): void {
  value = graphFocus(value);
  const relatedBoxes = new Set<string>();
  const relatedNodes = new Set<string>();
  const graph = visibleGraph();
  const focusedPair = value?.type === "node" ? findUiPairs(graph.components).find((pair) => pair.read.nodeId === value.nodeId) : undefined;
  if (value?.type === "container") {
    relatedBoxes.add(value.containerId);
  } else if (value?.type === "node") {
    const node = implementationDataflow.nodes.find((node) => node.id === value.nodeId)!;
    relatedNodes.add(node.id);
    relatedBoxes.add(node.type === "function" || node.type === "state-variable" ? node.containerId : node.id);
    for (const component of graph.components.filter((component) => component.nodeId === node.id)) relatedBoxes.add(component.id);
  }
  const selectedRelationships = value?.type === "relationship" ? relationshipsForEdge(graph.relationships, value.edge, functionsHidden) : [];
  for (const relationship of graph.relationships.filter((item) => relationshipMatches(item, value, selectedRelationships))) {
    for (const endpoint of [relationship.from, relationship.to]) {
      relatedBoxes.add(endpoint.boxId);
      if (endpoint.nodeId !== undefined) relatedNodes.add(endpoint.nodeId);
    }
  }
  for (const element of app.querySelectorAll<HTMLElement>(".graph-node[data-node]")) {
    const memberVisible = element.dataset.nodeId === undefined || relatedNodes.has(element.dataset.nodeId) || (value?.type === "container" && value.containerId === element.dataset.node);
    element.classList.toggle("dimmed", value !== undefined && (!relatedBoxes.has(element.dataset.node!) || !memberVisible));
    const paired = focusedPair !== undefined && element.dataset.nodeId === focusedPair.read.nodeId;
    element.classList.toggle("pair-partner", paired);
    element.querySelector(".pair-token")?.classList.toggle("active", paired);
  }
  for (const element of app.querySelectorAll<SVGElement>(".class-frame[data-node]")) {
    element.classList.toggle("dimmed", value !== undefined && !relatedBoxes.has(element.dataset.node!));
  }
  for (const element of app.querySelectorAll<SVGElement>("[data-relation]")) {
    const relevant = value !== undefined && (value.type === "relationship"
      ? element.getAttribute("data-edge") === value.edge
      : endpointDatasetMatches(element, "from", value) || endpointDatasetMatches(element, "to", value));
    element.classList.toggle("dimmed", value !== undefined && !relevant);
  }
  let links = "";
  if (focusedPair !== undefined) {
    const link = linkPath(graphLayout.boxes.get(focusedPair.read.id)!, graphLayout.boxes.get(focusedPair.write.id)!);
    links = `<path class="pair-link-halo" d="${link.d}"></path><path class="pair-link" d="${link.d}"></path>
      <circle class="pair-link-end" cx="${link.start.x}" cy="${link.start.y}" r="5"></circle>
      <circle class="pair-link-end" cx="${link.end.x}" cy="${link.end.y}" r="5"></circle>`;
  }
  app.querySelector<SVGElement>(".pair-link-layer")!.innerHTML = links;
}

function fitGraph(graphWidth: number, graphHeight: number): void {
  if (!userZoomed) {
    const canvas = app.querySelector<HTMLElement>(".canvas");
    if (canvas !== null) {
      const legend = app.querySelector<HTMLElement>(".change-legend")!;
      const nextZoom = Math.min(1, Math.max(0.15, Math.min(
        (canvas.clientWidth - 112) / graphWidth,
        (canvas.clientHeight - 2 * (legend.offsetHeight + 28)) / graphHeight,
      )));
      if (nextZoom !== zoom) {
        zoom = nextZoom;
        updateGraphTransform();
      }
    }
  }
}

function setZoom(nextZoom: number): void {
  zoom = Math.min(1.4, Math.max(0.15, Math.round(nextZoom * 10) / 10));
  userZoomed = true;
  updateGraphTransform();
}

function validationMessage(errors: ErrorObject[] | null | undefined): string {
  return (errors ?? []).slice(0, 3).map((error) => `${error.instancePath || "/"} ${error.message}`).join("; ");
}

function setImplementationDataflow(value: unknown, nextFileName: string): string | undefined {
  if (!validate(value)) {
    return validationMessage(validate.errors);
  } else {
    const nextImplementationDataflow = value;
    const error = semanticError(nextImplementationDataflow);
    if (error !== undefined) {
      return error;
    } else {
      implementationDataflow = nextImplementationDataflow;
      fileName = nextFileName;
      selection = undefined;
      hovered = undefined;
      panX = 0;
      panY = 0;
      statusMessage = "";
      userZoomed = false;
    }
  }
}

async function openFile(file: File, handle?: JsonFileHandle, contents?: string): Promise<void> {
  try {
    const fileContents = contents ?? await file.text();
    const value: unknown = JSON.parse(fileContents);
    const error = setImplementationDataflow(value, file.name);
    if (error === undefined) {
      localStorage.setItem(LAST_OPENED_KEY, JSON.stringify({ fileName: file.name, value }));
      openedRepositoryFile = undefined;
      stopWatchingOpenedFile?.();
      stopWatchingOpenedFile = handle === undefined ? undefined : watchOpenedJson(
        handle,
        fileContents,
        (changedFile, changedContents) => openFile(changedFile, handle, changedContents),
        (watchError) => {
          statusMessage = `Could not refresh ${file.name}: ${watchError instanceof Error ? watchError.message : String(watchError)}`;
          render();
        },
      );
    } else {
      statusMessage = `Could not open ${file.name}: ${error}`;
    }
  } catch (error) {
    statusMessage = `Could not open ${file.name}: ${error instanceof Error ? error.message : String(error)}`;
  }
  render();
}

async function openDefaultFile(): Promise<void> {
  const stored = localStorage.getItem(LAST_OPENED_KEY);
  let openedStoredFile = false;
  if (stored !== null) {
    try {
      const lastOpened = JSON.parse(stored) as { fileName: string; value: unknown };
      openedStoredFile = setImplementationDataflow(lastOpened.value, lastOpened.fileName) === undefined;
      if (!openedStoredFile) localStorage.removeItem(LAST_OPENED_KEY);
    } catch {
      localStorage.removeItem(LAST_OPENED_KEY);
    }
  }

  if (!openedStoredFile) {
    try {
      const response = await fetch("/__impl-dataflow/default");
      if (response.ok && response.status !== 204) {
        const defaultFile = await response.json() as { fileName: string; contents: string };
        const error = setImplementationDataflow(JSON.parse(defaultFile.contents), defaultFile.fileName);
        if (error === undefined) {
          openedRepositoryFile = defaultFile.fileName;
        } else {
          statusMessage = `Could not open ${defaultFile.fileName}: ${error}`;
        }
      }
    } catch {
      // The bundled example remains the default when no repository file is available.
    }
  }
  render();
}

import.meta.hot?.on("hld-dataflow:file-change", (update: { fileName: string; contents: string }) => {
  if (update.fileName === openedRepositoryFile) {
    try {
      const error = setImplementationDataflow(JSON.parse(update.contents), update.fileName);
      if (error !== undefined) statusMessage = `Could not refresh ${update.fileName}: ${error}`;
    } catch (error) {
      statusMessage = `Could not refresh ${update.fileName}: ${error instanceof Error ? error.message : String(error)}`;
    }
    render();
  }
});

window.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && selection !== undefined) {
    selection = undefined;
    hovered = undefined;
    render();
  }
});

window.addEventListener("dragenter", (event) => {
  event.preventDefault();
  dragDepth += 1;
  render();
});

window.addEventListener("dragover", (event) => event.preventDefault());

window.addEventListener("dragleave", (event) => {
  event.preventDefault();
  dragDepth = Math.max(0, dragDepth - 1);
  render();
});

window.addEventListener("drop", (event) => {
  event.preventDefault();
  dragDepth = 0;
  void droppedJsonFile(event).then((opened) => {
    if (opened !== undefined) return openFile(opened.file, opened.handle);
  }).catch((error) => {
    statusMessage = `Could not open JSON: ${error instanceof Error ? error.message : String(error)}`;
    render();
  });
});

const observer = new ResizeObserver(() => {
  if (!userZoomed) render();
});

if (new URLSearchParams(location.search).has("embedded")) {
  document.body.classList.add("embedded");
  window.addEventListener("message", (event: MessageEvent<{ type: string; value: unknown; name: string }>) => {
    if (event.source === window.parent && event.origin === location.origin && event.data.type === "load-impl-dataflow") {
      const error = setImplementationDataflow(event.data.value, event.data.name);
      statusMessage = error === undefined ? "" : `Could not open ${event.data.name}: ${error}`;
      render();
    }
  });
  render();
} else {
  void openDefaultFile();
}
observer.observe(app);
