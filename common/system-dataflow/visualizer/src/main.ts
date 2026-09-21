import Ajv2020, { type ErrorObject } from "ajv/dist/2020.js";
import schema from "../../system-dataflow.schema.json";
import example from "../../system-dataflow.example.json";
import { computeLayout } from "./layout.ts";
import { routeEdge } from "./routing.ts";
import type {
  ChangeType,
  NodeType,
  Selection,
  SystemDataflow,
  SystemDataflowNode,
  SystemDataflowRelationship,
} from "./types.ts";
import { semanticError } from "./validation.ts";
import "./styles.css";

type DisplayChangeType = ChangeType | "unspecified";

const app = document.querySelector<HTMLDivElement>("#app")!;
const ajv = new Ajv2020({ allErrors: true });
const validate = ajv.compile<SystemDataflow>(schema);

const CHANGE_COLORS: Record<DisplayChangeType, string> = {
  added: "oklch(0.76 0.16 155)",
  modified: "oklch(0.82 0.15 82)",
  deleted: "oklch(0.72 0.18 25)",
  unchanged: "oklch(0.56 0.02 250)",
  unspecified: "oklch(0.67 0.035 250)",
};

type Silhouette =
  | "rect"
  | "dashed"
  | "stadium-left"
  | "stadium-right"
  | "cylinder"
  | "dogear"
  | "hexagon";

/** Pixels between two connections meeting the same node edge, and the clearance kept from its corners. */
const ATTACHMENT_GAP = 22;
const ATTACHMENT_MARGIN = 10;

const NODE_TYPES: Record<NodeType, { label: string; badge: string; shape: Silhouette; color: string }> = {
  "user-input": { label: "User input", badge: "USER →", shape: "rect", color: "oklch(0.80 0.095 232)" },
  "user-output": { label: "User output", badge: "→ USER", shape: "rect", color: "oklch(0.78 0.095 300)" },
  "external-dependency": { label: "External dependency", badge: "EXTERNAL", shape: "dashed", color: "oklch(0.75 0.085 278)" },
  "system-input": { label: "System input", badge: "SYSTEM →", shape: "stadium-left", color: "oklch(0.80 0.085 205)" },
  "system-output": { label: "System output", badge: "→ SYSTEM", shape: "stadium-right", color: "oklch(0.76 0.095 325)" },
  "system-state": { label: "System state", badge: "STATE", shape: "cylinder", color: "oklch(0.80 0.075 185)" },
  "static-data": { label: "Static data", badge: "STATIC", shape: "dogear", color: "oklch(0.71 0.03 250)" },
  "data-processing": { label: "Data processing", badge: "PROCESSING", shape: "hexagon", color: "oklch(0.85 0.09 255)" },
};

let dataflow = example as SystemDataflow;
let fileName = "system-dataflow.example.json";
let showUnchanged = true;
let zoom = 1;
let panX = 0;
let panY = 0;
let graphWidth = 320;
let graphHeight = 240;
let userZoomed = false;
let selection: Selection | undefined;
let hovered: Selection | undefined;
let statusMessage = "";
let dragDepth = 0;

function escapeHtml(value: string | number): string {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function displayChangeType(changeType: ChangeType | undefined): DisplayChangeType {
  return changeType ?? "unspecified";
}

function changeColor(changeType: ChangeType | undefined): string {
  return CHANGE_COLORS[displayChangeType(changeType)];
}

function chip(changeType: ChangeType | undefined): string {
  if (changeType === undefined) {
    return "";
  } else {
    const color = changeColor(changeType);
    return `<span class="change-chip" style="color:${color};background:color-mix(in oklch, ${color} 15%, transparent)">${changeType}</span>`;
  }
}

function selectionKey(value: Selection | undefined): string {
  if (value === undefined) {
    return "";
  } else if (value.type === "node") {
    return `node:${value.name}`;
  } else {
    return `relationship:${value.id}`;
  }
}

function visibleDataflow(): { nodes: SystemDataflowNode[]; relationships: SystemDataflowRelationship[] } {
  const nodes = showUnchanged ? dataflow.nodes : dataflow.nodes.filter((node) => node.changeType !== "unchanged");
  const nodeNames = new Set(nodes.map((node) => node.name));
  const relationships = dataflow.relationships.filter(
    (relationship) =>
      (showUnchanged || relationship.changeType !== "unchanged") &&
      nodeNames.has(relationship.from) &&
      nodeNames.has(relationship.to),
  );
  return { nodes, relationships };
}

function related(relationship: SystemDataflowRelationship, value: Selection | undefined): boolean {
  if (value === undefined) {
    return false;
  } else if (value.type === "relationship") {
    return relationship.id === value.id;
  } else {
    return relationship.from === value.name || relationship.to === value.name;
  }
}

/** Half the width of a silhouette's flat top and bottom edge: how far an attachment point may slide. */
function flatHalfSpan(shape: Silhouette, width: number, height: number): number {
  if (shape === "stadium-left" || shape === "stadium-right") {
    return width / 2 - height / 2;
  } else if (shape === "cylinder") {
    return width / 2 - width * 0.0565;
  } else if (shape === "hexagon") {
    return width / 2 - width * 0.0806;
  } else if (shape === "dogear") {
    return width / 2 - height * 0.239;
  } else if (shape === "dashed") {
    return width / 2 - height * 0.152;
  } else {
    return width / 2 - height * 0.065;
  }
}

/** The card outline for a node type. Shape carries the type; the stroke colour carries the change. */
function silhouette(shape: Silhouette, width: number, height: number): { outline: string; details: string[]; dashed: boolean } {
  const round = (value: number): number => Math.round(value * 100) / 100;
  const half = round(height / 2);
  const inset = round(height * 0.076);
  const cap = round(width * 0.0565);
  const cut = round(height * 0.239);
  const chamfer = round(width * 0.0806);

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
  } else if (shape === "cylinder") {
    return {
      outline: `M ${cap} 0 L ${width - cap} 0 A ${cap} ${half} 0 0 1 ${width - cap} ${height} L ${cap} ${height} A ${cap} ${half} 0 0 1 ${cap} 0 Z`,
      details: [`M ${cap} 0 A ${cap} ${half} 0 0 0 ${cap} ${height}`],
      dashed: false,
    };
  } else if (shape === "hexagon") {
    return {
      outline: `M ${chamfer} 0 L ${width - chamfer} 0 L ${width} ${half} L ${width - chamfer} ${height} L ${chamfer} ${height} L 0 ${half} Z`,
      details: [],
      dashed: false,
    };
  } else if (shape === "dogear") {
    const r = round(height * 0.109);
    return {
      outline: `M ${r} 0 L ${width - cut} 0 L ${width} ${cut} L ${width} ${height - r} A ${r} ${r} 0 0 1 ${width - r} ${height} L ${r} ${height} A ${r} ${r} 0 0 1 0 ${height - r} L 0 ${r} A ${r} ${r} 0 0 1 ${r} 0 Z`,
      details: [`M ${width - cut} 0 L ${width - cut} ${cut} L ${width} ${cut}`],
      dashed: false,
    };
  } else if (shape === "dashed") {
    return { outline: roundedRect(height * 0.152), details: [], dashed: true };
  } else {
    return { outline: roundedRect(height * 0.065), details: [], dashed: false };
  }
}

function renderMarkers(): string {
  return (Object.keys(CHANGE_COLORS) as DisplayChangeType[])
    .map(
      (changeType) => `<marker id="arrow-${changeType}" viewBox="0 0 8 8" refX="7" refY="4" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M 0 1 L 7 4 L 0 7 z" fill="${CHANGE_COLORS[changeType]}"></path></marker>`,
    )
    .join("");
}

function renderGraph(): string {
  const graph = visibleDataflow();
  const layout = computeLayout(graph.nodes, graph.relationships);
  graphWidth = layout.width;
  graphHeight = layout.height;
  const focus = hovered ?? selection;
  const relatedNodes = new Set<string>();
  if (focus?.type === "node") {
    relatedNodes.add(focus.name);
  } else if (focus?.type === "relationship") {
    const relationship = graph.relationships.find((item) => item.id === focus.id);
    if (relationship !== undefined) {
      relatedNodes.add(relationship.from);
      relatedNodes.add(relationship.to);
    }
  }
  for (const relationship of graph.relationships.filter((item) => related(item, focus))) {
    relatedNodes.add(relationship.from);
    relatedNodes.add(relationship.to);
  }

  const outgoingIds = new Map<string, string[]>();
  const incomingIds = new Map<string, string[]>();
  for (const relationship of graph.relationships) {
    if (!outgoingIds.has(relationship.from)) outgoingIds.set(relationship.from, []);
    outgoingIds.get(relationship.from)!.push(relationship.id);
    if (!incomingIds.has(relationship.to)) incomingIds.set(relationship.to, []);
    incomingIds.get(relationship.to)!.push(relationship.id);
  }

  /** Spaces a node's connections evenly along its edge instead of stacking them at the centre. */
  function attachmentOffset(nodeName: string, relationshipId: string, groups: Map<string, string[]>): number {
    const group = groups.get(nodeName) ?? [];
    const node = graph.nodes.find((item) => item.name === nodeName);
    const box = layout.boxes.get(nodeName);
    if (group.length < 2 || node === undefined || box === undefined) {
      return 0;
    }
    const room = Math.max(0, flatHalfSpan(NODE_TYPES[node.type].shape, box.width, box.height) - ATTACHMENT_MARGIN);
    const gap = Math.min(ATTACHMENT_GAP, (room * 2) / (group.length - 1));
    return (group.indexOf(relationshipId) - (group.length - 1) / 2) * gap;
  }

  const edges = graph.relationships
    .map((relationship) => {
      const from = layout.boxes.get(relationship.from);
      const to = layout.boxes.get(relationship.to);
      if (from === undefined || to === undefined) return "";
      const obstacles = [...layout.boxes]
        .filter(([name]) => name !== relationship.from && name !== relationship.to)
        .map(([, box]) => box);
      const startSpread = attachmentOffset(relationship.from, relationship.id, outgoingIds);
      const endSpread = attachmentOffset(relationship.to, relationship.id, incomingIds);
      const route = routeEdge(from, to, startSpread, endSpread, obstacles);
      const visualChangeType = displayChangeType(relationship.changeType);
      const color = changeColor(relationship.changeType);
      const dimmed = focus !== undefined && !related(relationship, focus);
      const selected = selectionKey(selection) === selectionKey({ type: "relationship", id: relationship.id });
      const attributes = `data-relationship="${escapeHtml(relationship.id)}" data-from="${escapeHtml(relationship.from)}" data-to="${escapeHtml(relationship.to)}"`;
      return `<path class="edge${dimmed ? " dimmed" : ""}${selected ? " selected" : ""}" ${attributes} d="${route.path}" fill="none" stroke="${color}" stroke-width="1.8" stroke-dasharray="${relationship.changeType === "deleted" ? "7 5" : ""}" stroke-linecap="round" stroke-linejoin="round" marker-end="url(#arrow-${visualChangeType})"></path>
        <circle class="edge${dimmed ? " dimmed" : ""}" ${attributes} cx="${route.start.x}" cy="${route.start.y}" r="3.5" fill="${color}" stroke="oklch(0.198 0.024 255)" stroke-width="1.5"></circle>
        <path class="edge-hit" ${attributes} data-select="relationship" d="${route.path}" fill="none" stroke="transparent" stroke-width="14" stroke-linecap="round" stroke-linejoin="round"></path>`;
    })
    .join("");

  const nodes = graph.nodes
    .map((node) => {
      const box = layout.boxes.get(node.name)!;
      const type = NODE_TYPES[node.type];
      const form = silhouette(type.shape, box.width, box.height);
      const selected = selectionKey(selection) === selectionKey({ type: "node", name: node.name });
      const dimmed = focus !== undefined && !relatedNodes.has(node.name);
      const details = form.details.map((detail) => `<path class="node-detail" d="${detail}"></path>`).join("");
      return `<button class="graph-node${selected ? " selected" : ""}${dimmed ? " dimmed" : ""}${node.changeType === "deleted" ? " deleted" : ""}" style="left:${box.x}px;top:${box.y}px;width:${box.width}px;height:${box.height}px;--type-color:${type.color};--change-color:${changeColor(node.changeType)}" data-select="node" data-node="${escapeHtml(node.name)}" aria-label="Inspect ${escapeHtml(type.label)} ${escapeHtml(node.name)}">
        <svg class="node-shape" width="${box.width}" height="${box.height}" viewBox="0 0 ${box.width} ${box.height}" aria-hidden="true">
          <path class="node-outline" d="${form.outline}"${form.dashed ? ' stroke-dasharray="7 5"' : ""}></path>${details}
        </svg>
        <span class="node-body">
          <span class="node-badge">${type.badge}</span>
          <span class="node-name">${escapeHtml(node.name)}</span>
          <span class="node-medium">${escapeHtml(node.medium)}</span>
        </span>
      </button>`;
    })
    .join("");

  queueMicrotask(fitGraph);
  return `<div class="graph-space">
    ${graph.nodes.length === 0 ? '<div class="empty-graph">No nodes match the current filters</div>' : ""}
    <div class="graph" style="left:calc(50% + ${panX}px);top:calc(50% + ${panY}px);width:${layout.width}px;height:${layout.height}px;transform:translate(-50%, -50%) scale(${zoom})">
      <svg class="graph-svg" width="${layout.width}" height="${layout.height}" aria-hidden="true"><defs>${renderMarkers()}</defs>${edges}</svg>
      ${nodes}
    </div>
  </div>`;
}

/** The type badge, as the graph cards wear it. */
function typeBadge(nodeType: NodeType): string {
  const type = NODE_TYPES[nodeType];
  return `<span class="type-badge" style="--type-color:${type.color}" title="${escapeHtml(type.label)}">${type.badge}</span>`;
}

function section(title: string, content: string, count?: number): string {
  return `<section class="inspector-section"><div class="section-heading"><span>${escapeHtml(title)}</span>${count === undefined ? "" : `<span class="inspector-count">${count}</span>`}</div>${content}</section>`;
}

function inspectorHeader(eyebrow: string, title: string, changeType?: ChangeType, detail?: string, badgeType?: NodeType): string {
  const lead = badgeType === undefined ? escapeHtml(eyebrow) : typeBadge(badgeType);
  return `<header class="inspector-header">
    <div class="inspector-eyebrow">${lead}</div>
    <div class="inspector-title-row"><div class="inspector-title">${escapeHtml(title)}</div><button class="close-button" data-close aria-label="Clear selection">✕</button></div>
    ${chip(changeType)}${detail === undefined ? "" : `<span class="detail-chip">${escapeHtml(detail)}</span>`}
  </header>`;
}

function relationshipRows(relationships: SystemDataflowRelationship[], direction: "in" | "out"): string {
  if (relationships.length === 0) {
    return '<p class="empty-copy">None</p>';
  } else {
    return `<div class="flow-list">${relationships
      .map((relationship) => {
        const endpoint = direction === "in" ? relationship.from : relationship.to;
        return `<button class="flow-row" style="border-color:${changeColor(relationship.changeType)}" data-jump-relationship="${escapeHtml(relationship.id)}">
          <span class="flow-endpoint">${direction === "in" ? `${escapeHtml(endpoint)} →` : `→ ${escapeHtml(endpoint)}`}</span>
          <span class="flow-data">${escapeHtml(relationship.data)}</span>
        </button>`;
      })
      .join("")}</div>`;
  }
}

function renderOverview(): string {
  const graph = visibleDataflow();
  const counts = new Map<NodeType, number>();
  for (const node of graph.nodes) counts.set(node.type, (counts.get(node.type) ?? 0) + 1);
  const typeRows = (Object.keys(NODE_TYPES) as NodeType[])
    .filter((type) => (counts.get(type) ?? 0) > 0)
    .map((type) => `<div class="type-count">${typeBadge(type)}<span>${escapeHtml(NODE_TYPES[type].label)}</span><strong>${counts.get(type)}</strong></div>`)
    .join("");

  const changeCounts = new Map<DisplayChangeType, number>();
  for (const node of graph.nodes) {
    const key = displayChangeType(node.changeType);
    changeCounts.set(key, (changeCounts.get(key) ?? 0) + 1);
  }
  const changeRows = (Object.keys(CHANGE_COLORS) as DisplayChangeType[])
    .filter((changeType) => (changeCounts.get(changeType) ?? 0) > 0)
    .map((changeType) => `<div class="type-count change-count"><span class="change-swatch" style="background:${CHANGE_COLORS[changeType]}"></span><span>${escapeHtml(changeType)}</span><strong>${changeCounts.get(changeType)}</strong></div>`)
    .join("");

  return `<div class="overview">
    <div class="overview-kicker">System dataflow</div>
    <h1>${escapeHtml(dataflow.feature)}</h1>
    <p>Select a node or connection to inspect its role in the flow.</p>
    <div class="overview-counts"><div><strong>${graph.nodes.length}</strong><span>nodes</span></div><div><strong>${graph.relationships.length}</strong><span>dataflows</span></div></div>
    <div class="overview-group">By type</div>
    <div class="type-counts">${typeRows}</div>
    <div class="overview-group">By change</div>
    <div class="type-counts">${changeRows}</div>
  </div>`;
}

function renderInspector(): string {
  const inspected = hovered ?? selection;
  if (inspected === undefined) {
    return renderOverview();
  } else if (inspected.type === "node") {
    const node = dataflow.nodes.find((item) => item.name === inspected.name)!;
    const type = NODE_TYPES[node.type];
    const incoming = dataflow.relationships.filter((relationship) => relationship.to === node.name);
    const outgoing = dataflow.relationships.filter((relationship) => relationship.from === node.name);
    const algorithm = node.algorithm === undefined ? "" : section("Algorithm", `<pre class="algorithm">${escapeHtml(node.algorithm)}</pre>`);
    return `${inspectorHeader(type.label, node.name, node.changeType, node.medium, node.type)}
      ${section("Responsibility", `<p class="entry-copy">${escapeHtml(node.description)}</p>`)}
      ${section("Location", `<p class="location-copy">${escapeHtml(node.location)}</p>`)}
      ${algorithm}
      ${section("Data in", relationshipRows(incoming, "in"), incoming.length)}
      ${section("Data out", relationshipRows(outgoing, "out"), outgoing.length)}`;
  } else {
    const relationship = dataflow.relationships.find((item) => item.id === inspected.id)!;
    const source = dataflow.nodes.find((item) => item.name === relationship.from);
    const destination = dataflow.nodes.find((item) => item.name === relationship.to);
    const endpoint = (role: string, name: string, node: SystemDataflowNode | undefined): string =>
      `<button data-jump-node="${escapeHtml(name)}"><span class="endpoint-role">${role}</span>${node === undefined ? "" : typeBadge(node.type)}<span class="endpoint-name">${escapeHtml(name)}</span></button>`;
    return `${inspectorHeader("Dataflow", `${relationship.from} → ${relationship.to}`, relationship.changeType, relationship.id)}
      <div class="endpoint-pair">
        ${endpoint("From", relationship.from, source)}
        <span class="endpoint-arrow">→</span>
        ${endpoint("To", relationship.to, destination)}
      </div>
      ${section("Data", `<p class="entry-copy">${escapeHtml(relationship.data)}</p>`)}
      ${section("Purpose", `<p class="entry-copy">${escapeHtml(relationship.purpose)}</p>`)}`;
  }
}

function renderLegend(): string {
  const changeTypes: DisplayChangeType[] = ["added", "modified", "deleted", "unchanged"];
  return `<div class="legend">${changeTypes
    .map((changeType) => `<span><i style="background:${CHANGE_COLORS[changeType]}"></i>${changeType}</span>`)
    .join("")}</div>`;
}

function render(): void {
  const hasUnchanged = dataflow.nodes.some((node) => node.changeType === "unchanged") || dataflow.relationships.some((relationship) => relationship.changeType === "unchanged");
  app.innerHTML = `<div class="app-shell">
    <header class="topbar">
      <div class="brand-block">
        <div class="brand-line"><span class="feature-name">${escapeHtml(dataflow.feature)}</span><span class="stage-chip">${escapeHtml(dataflow.stage)}</span></div>
        <div class="file-label" title="${escapeHtml(fileName)}">${escapeHtml(fileName)}</div>
      </div>
      <div class="control-group">
        <span class="interaction-hint">Wheel to zoom · right-drag to pan</span>
        <button class="control-button primary" data-open>Open JSON</button>
        ${hasUnchanged ? `<button class="control-button${showUnchanged ? "" : " active"}" data-toggle-unchanged aria-pressed="${!showUnchanged}">${showUnchanged ? "Hide unchanged" : "Show unchanged"}</button>` : ""}
        <div class="zoom-controls"><button class="zoom-button" data-zoom-out aria-label="Zoom out">−</button><button class="zoom-button${userZoomed ? "" : " active"}" data-fit aria-pressed="${!userZoomed}">Fit · ${Math.round(zoom * 100)}%</button><button class="zoom-button" data-zoom-in aria-label="Zoom in">+</button></div>
      </div>
    </header>
    <div class="workspace">
      <main class="canvas" aria-label="System dataflow graph">
        ${statusMessage === "" ? "" : `<div class="status-banner">${escapeHtml(statusMessage)}</div>`}
        ${dragDepth === 0 ? "" : '<div class="drop-overlay">Drop a System Dataflow JSON file</div>'}
        ${renderGraph()}
        ${renderLegend()}
      </main>
      <aside class="inspector" aria-label="Dataflow inspector">${renderInspector()}</aside>
    </div>
    <input data-file-input type="file" accept="application/json,.json" hidden />
  </div>`;
  bindInteractions();
}

function bindInspector(): void {
  const inspector = app.querySelector<HTMLElement>(".inspector")!;
  inspector.addEventListener("click", (event) => {
    const target = (event.target as HTMLElement).closest<HTMLElement>("[data-jump-node], [data-jump-relationship], [data-close]");
    if (target?.dataset.jumpNode !== undefined) {
      selection = { type: "node", name: target.dataset.jumpNode };
      hovered = undefined;
      render();
    } else if (target?.dataset.jumpRelationship !== undefined) {
      selection = { type: "relationship", id: target.dataset.jumpRelationship };
      hovered = undefined;
      render();
    } else if (target?.hasAttribute("data-close")) {
      selection = undefined;
      hovered = undefined;
      render();
    }
  });
}

function updateInspector(): void {
  app.querySelector<HTMLElement>(".inspector")!.innerHTML = renderInspector();
  bindInspector();
}

function updateGraphFocus(value: Selection | undefined): void {
  const graph = visibleDataflow();
  const relatedNodes = new Set<string>();
  if (value?.type === "node") {
    relatedNodes.add(value.name);
  } else if (value?.type === "relationship") {
    const relationship = graph.relationships.find((item) => item.id === value.id);
    if (relationship !== undefined) {
      relatedNodes.add(relationship.from);
      relatedNodes.add(relationship.to);
    }
  }
  for (const relationship of graph.relationships.filter((item) => related(item, value))) {
    relatedNodes.add(relationship.from);
    relatedNodes.add(relationship.to);
  }
  for (const element of app.querySelectorAll<HTMLElement>(".graph-node[data-node]")) {
    element.classList.toggle("dimmed", value !== undefined && !relatedNodes.has(element.dataset.node!));
  }
  for (const element of app.querySelectorAll<SVGElement>("[data-relationship]")) {
    const relationship = graph.relationships.find((item) => item.id === element.dataset.relationship)!;
    element.classList.toggle("dimmed", value !== undefined && !related(relationship, value));
  }
}

function bindInteractions(): void {
  bindInspector();
  for (const element of app.querySelectorAll<HTMLElement>("[data-select]")) {
    const target = (): Selection => {
      if (element.dataset.select === "node") {
        return { type: "node", name: element.dataset.node! };
      } else {
        return { type: "relationship", id: element.dataset.relationship! };
      }
    };
    element.addEventListener("click", (event) => {
      event.stopPropagation();
      selection = target();
      hovered = undefined;
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

  const canvas = app.querySelector<HTMLElement>(".canvas")!;
  let panPointer: number | undefined;
  let startX = 0;
  let startY = 0;
  let startPanX = 0;
  let startPanY = 0;
  canvas.addEventListener("pointerdown", (event) => {
    if (event.button === 2) {
      panPointer = event.pointerId;
      startX = event.clientX;
      startY = event.clientY;
      startPanX = panX;
      startPanY = panY;
      canvas.setPointerCapture(event.pointerId);
      canvas.classList.add("panning");
      event.preventDefault();
    }
  });
  canvas.addEventListener("pointermove", (event) => {
    if (event.pointerId === panPointer) {
      panX = startPanX + event.clientX - startX;
      panY = startPanY + event.clientY - startY;
      updateGraphTransform();
    }
  });
  canvas.addEventListener("pointerup", (event) => {
    if (event.pointerId === panPointer) {
      canvas.releasePointerCapture(event.pointerId);
      canvas.classList.remove("panning");
      panPointer = undefined;
    }
  });
  canvas.addEventListener("pointercancel", () => {
    canvas.classList.remove("panning");
    panPointer = undefined;
  });
  canvas.addEventListener("contextmenu", (event) => event.preventDefault());
  canvas.addEventListener(
    "wheel",
    (event) => {
      const nextZoom = Math.min(1.5, Math.max(0.2, zoom * Math.exp(-event.deltaY * 0.0015)));
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
      hovered = undefined;
      render();
    }
  });

  app.querySelector<HTMLElement>("[data-zoom-out]")!.addEventListener("click", () => setZoom(zoom - 0.1));
  app.querySelector<HTMLElement>("[data-zoom-in]")!.addEventListener("click", () => setZoom(zoom + 0.1));
  app.querySelector<HTMLElement>("[data-fit]")!.addEventListener("click", () => {
    panX = 0;
    panY = 0;
    userZoomed = false;
    fitGraph();
  });
  app.querySelector<HTMLElement>("[data-toggle-unchanged]")?.addEventListener("click", () => {
    showUnchanged = !showUnchanged;
    selection = undefined;
    hovered = undefined;
    panX = 0;
    panY = 0;
    userZoomed = false;
    render();
  });
  const input = app.querySelector<HTMLInputElement>("[data-file-input]")!;
  app.querySelector<HTMLElement>("[data-open]")!.addEventListener("click", () => input.click());
  input.addEventListener("change", () => {
    const file = input.files?.[0];
    if (file !== undefined) void openFile(file);
  });
}

function updateGraphTransform(): void {
  const graph = app.querySelector<HTMLElement>(".graph");
  if (graph !== null) {
    graph.style.left = `calc(50% + ${panX}px)`;
    graph.style.top = `calc(50% + ${panY}px)`;
    graph.style.transform = `translate(-50%, -50%) scale(${zoom})`;
  }
  const fitButton = app.querySelector<HTMLElement>("[data-fit]");
  if (fitButton !== null) {
    fitButton.textContent = `Fit · ${Math.round(zoom * 100)}%`;
    fitButton.classList.toggle("active", !userZoomed);
    fitButton.setAttribute("aria-pressed", String(!userZoomed));
  }
}

function fitGraph(): void {
  if (!userZoomed) {
    const canvas = app.querySelector<HTMLElement>(".canvas");
    if (canvas !== null) {
      zoom = Math.max(0.2, Math.min(1, (canvas.clientWidth - 96) / graphWidth, (canvas.clientHeight - 96) / graphHeight));
      updateGraphTransform();
    }
  }
}

function setZoom(nextZoom: number): void {
  zoom = Math.min(1.5, Math.max(0.2, Math.round(nextZoom * 10) / 10));
  userZoomed = true;
  updateGraphTransform();
}

function validationMessage(errors: ErrorObject[] | null | undefined): string {
  return (errors ?? []).slice(0, 3).map((error) => `${error.instancePath || "/"} ${error.message}`).join("; ");
}

function setDataflow(value: unknown, nextFileName: string): string | undefined {
  let error: string | undefined;
  if (!validate(value)) {
    error = validationMessage(validate.errors);
  } else {
    error = semanticError(value);
    if (error === undefined) {
      dataflow = value;
      fileName = nextFileName;
      showUnchanged = true;
      selection = undefined;
      hovered = undefined;
      zoom = 1;
      panX = 0;
      panY = 0;
      userZoomed = false;
      statusMessage = "";
    }
  }
  return error;
}

async function openFile(file: File): Promise<void> {
  try {
    const value: unknown = JSON.parse(await file.text());
    const error = setDataflow(value, file.name);
    if (error !== undefined) statusMessage = `Could not open ${file.name}: ${error}`;
  } catch (error) {
    statusMessage = `Could not open ${file.name}: ${error instanceof Error ? error.message : String(error)}`;
  }
  render();
}

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
  const file = event.dataTransfer?.files[0];
  if (file !== undefined) void openFile(file);
});

const observer = new ResizeObserver(fitGraph);
render();
observer.observe(app);
