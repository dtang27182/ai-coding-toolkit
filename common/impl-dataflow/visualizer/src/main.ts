import Ajv2020, { type ErrorObject } from "ajv/dist/2020.js";
import implementationDataflowSchema from "../../impl-dataflow.schema.json";
import exampleImplementationDataflow from "../../impl-dataflow.example.json";
import { computeLayout } from "./layout";
import { filterGraph, type VisibleGraph } from "./filter";
import { edgePortSpreads, routeCompositionEdge, routeEdge } from "./routing";
import { semanticError } from "./validation";
import "./styles.css";
import type {
  ComponentType,
  ChangeType,
  ClassDiff,
  ImplementationDataflow,
  Rect,
  ResolvedEndpoint,
  ResolvedRelationship,
  Selection,
} from "./types";
import { edgeKey, isInternalStateRelationship, mergeClassDataflows, methodKey } from "./types";
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

const COMPONENT_LABELS: Record<ComponentType, string> = {
  "ui-component": "UI component",
  "system-input": "System input",
  "system-output": "System output",
  "external-dependency": "External dependency",
};

const COMPONENT_GLYPHS: Record<ComponentType, string> = {
  "ui-component": "▣",
  "system-input": "→",
  "system-output": "←",
  "external-dependency": "⇅",
};

let implementationDataflow = exampleImplementationDataflow as ImplementationDataflow;
let fileName = "impl-dataflow.example.json";
let showUnchanged = true;
let userFlowOnly = false;
let methodsHidden = false;
let zoom = 1;
let panX = 0;
let panY = 0;
let inspectorWidth = 356;
let currentGraphWidth = 320;
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

function changeColor(changeType: ChangeType): string {
  return CHANGE_COLORS[changeType];
}

function chipStyle(changeType: ChangeType): string {
  return `color:${changeColor(changeType)};background:color-mix(in oklch, ${changeColor(changeType)} 15%, transparent)`;
}

function methodWidth(name: string, writesState: boolean): number {
  measureContext.font = "500 12.5px IBM Plex Mono, monospace";
  return Math.ceil(measureContext.measureText(name).width) + (writesState ? 57 : 42);
}

function stateVariableWidth(name: string): number {
  measureContext.font = "500 12px IBM Plex Mono, monospace";
  return Math.ceil(measureContext.measureText(name).width) + 56;
}

function componentWidth(name: string): number {
  measureContext.font = "500 12.5px IBM Plex Sans, sans-serif";
  return Math.ceil(measureContext.measureText(name).width);
}

function tabWidth(classDiff: ClassDiff): number {
  measureContext.font = "600 11.5px IBM Plex Mono, monospace";
  const exposure = classExposureCount(classDiff);
  return Math.ceil(measureContext.measureText(classDiff.name).width) + String(exposure ?? "?").length * 6 + 56;
}

function classExposureCount(classDiff: ClassDiff): number | null {
  if (classDiff.variableExposureCount !== undefined) {
    return classDiff.variableExposureCount;
  } else if (classDiff.variableExposure === undefined || classDiff.variableExposure === null) {
    return null;
  } else {
    return classDiff.variableExposure.length;
  }
}

function endpointLabel(endpoint: ResolvedEndpoint): string {
  if (endpoint.component) {
    return endpoint.nodeName;
  } else if (endpoint.methodName !== undefined) {
    return `${endpoint.nodeName}.${endpoint.methodName}`;
  } else if (endpoint.stateVariableName !== undefined) {
    return `${endpoint.nodeName}.${endpoint.stateVariableName}`;
  } else {
    return endpoint.nodeName;
  }
}

function selectionForEndpoint(endpoint: ResolvedEndpoint): Selection {
  if (endpoint.staticData) {
    return { type: "static-data", staticDataName: endpoint.nodeName };
  } else if (endpoint.component) {
    return { type: "component", componentName: endpoint.nodeName };
  } else if (endpoint.methodName !== undefined) {
    return { type: "method", className: endpoint.nodeName, methodName: endpoint.methodName };
  } else {
    return { type: "class", className: endpoint.nodeName };
  }
}

function selectionKey(value: Selection | undefined): string {
  if (value === undefined) {
    return "";
  } else if (value.type === "static-data") {
    return `static-data:${value.staticDataName}`;
  } else if (value.type === "component") {
    return `component:${value.componentName}`;
  } else if (value.type === "method") {
    return `method:${value.className}:${value.methodName}`;
  } else if (value.type === "relationship") {
    return `relationship:${value.edge}`;
  } else {
    return `class:${value.className}`;
  }
}

function endpointMatches(endpoint: ResolvedEndpoint, value: Selection): boolean {
  if (value.type === "static-data") {
    return endpoint.staticData === true && endpoint.nodeName === value.staticDataName;
  } else if (value.type === "component") {
    return endpoint.component && endpoint.nodeName === value.componentName;
  } else if (value.type === "method") {
    return !endpoint.component && endpoint.nodeName === value.className && endpoint.methodName === value.methodName;
  } else if (value.type === "relationship") {
    return false;
  } else {
    return !endpoint.component && endpoint.nodeName === value.className;
  }
}

function relationshipMatches(relationship: ResolvedRelationship, value: Selection | undefined): boolean {
  if (value === undefined) {
    return false;
  } else if (value.type === "relationship") {
    return edgeKey(relationship, methodsHidden) === value.edge;
  } else {
    return endpointMatches(relationship.from, value) || endpointMatches(relationship.to, value);
  }
}

/** Every relationship drawn as the given edge; more than one when collapsing methods merged them. */
function relationshipsForEdge(graph: VisibleGraph, edge: string): ResolvedRelationship[] {
  return graph.relationships.filter(
    (relationship) => relationship.relationship.type !== "composition" && edgeKey(relationship, methodsHidden) === edge,
  );
}

function graphFocus(value: Selection | undefined): Selection | undefined {
  if (methodsHidden && value?.type === "method") {
    return { type: "class", className: value.className };
  } else {
    return value;
  }
}

function nodeMatches(nodeName: string, methodName: string | undefined, value: Selection | undefined): boolean {
  if (value === undefined) {
    return true;
  } else if (value.type === "static-data") {
    return nodeName === value.staticDataName;
  } else if (value.type === "component") {
    return nodeName === value.componentName;
  } else if (value.type === "method") {
    return nodeName === value.className && (methodName === undefined || methodName === value.methodName);
  } else if (value.type === "relationship") {
    return false;
  } else {
    return nodeName === value.className;
  }
}

function relationshipAttributes(relationship: ResolvedRelationship): string {
  return `data-relation data-edge="${escapeHtml(edgeKey(relationship, methodsHidden))}" data-from-node="${escapeHtml(relationship.from.nodeName)}" data-from-method="${escapeHtml(relationship.from.methodName ?? "")}" data-from-component="${relationship.from.component}" data-from-static-data="${relationship.from.staticData === true}" data-to-node="${escapeHtml(relationship.to.nodeName)}" data-to-method="${escapeHtml(relationship.to.methodName ?? "")}" data-to-component="${relationship.to.component}" data-to-static-data="${relationship.to.staticData === true}"`;
}

function visibleGraph(): VisibleGraph {
  return filterGraph(implementationDataflow, showUnchanged, userFlowOnly);
}

function graphRect(
  endpoint: ResolvedEndpoint,
  boxes: Map<string, Rect>,
  methodRects: Map<string, Rect>,
  stateRects: Map<string, Rect>,
): Rect | undefined {
  if (endpoint.stateVariableName !== undefined && !methodsHidden) {
    return stateRects.get(endpoint.nodeName);
  } else if (endpoint.methodName !== undefined && !methodsHidden) {
    return methodRects.get(methodKey(endpoint.nodeName, endpoint.methodName));
  }
  return boxes.get(endpoint.nodeName);
}

function graphEndpointKey(endpoint: ResolvedEndpoint): string {
  if (endpoint.stateVariableName !== undefined && !methodsHidden) {
    return `state:${endpoint.nodeName}`;
  } else if (endpoint.methodName !== undefined && !methodsHidden) {
    return `method:${endpoint.nodeName}:${endpoint.methodName}`;
  } else {
    return `node:${endpoint.nodeName}`;
  }
}

function classTargetRect(classDiff: ClassDiff, box: Rect): Rect {
  return { x: box.x + 10, y: box.y - 12, width: tabWidth(classDiff), height: 24 };
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
  const stateWriters = new Set(
    graph.relationships
      .filter((relationship) => relationship.relationship.type === "state-update" && relationship.from.methodName !== undefined)
      .map((relationship) => methodKey(relationship.from.nodeName, relationship.from.methodName!)),
  );
  const layout = computeLayout(graph.nodes, graph.relationships, methodsHidden, methodWidth, stateVariableWidth, componentWidth, stateWriters);
  currentGraphWidth = layout.width;
  const classByName = new Map(graph.classes.map((classDiff) => [classDiff.name, classDiff]));
  const routingBounds = new Map(graph.nodes.map((node): [string, Rect] => {
    const box = layout.boxes.get(node.name)!;
    if (node.nodeType !== undefined) {
      return [node.name, box];
    } else {
      const tab = classTargetRect(classByName.get(node.name)!, box);
      return methodsHidden
        ? [node.name, tab]
        : [node.name, { x: box.x, y: tab.y, width: Math.max(box.width, tab.x + tab.width - box.x), height: box.y + box.height - tab.y }];
    }
  }));
  function obstaclesFor(relationship: ResolvedRelationship): Rect[] {
    return [...routingBounds].filter(([name]) => name !== relationship.from.nodeName && name !== relationship.to.nodeName).map(([, box]) => box);
  }
  const focus = graphFocus(hovered ?? selection);

  const relatedNodes = new Set<string>();
  if (focus !== undefined) {
    if (focus.type === "static-data") {
      relatedNodes.add(focus.staticDataName);
    } else if (focus.type === "component") {
      relatedNodes.add(focus.componentName);
    } else if (focus.type !== "relationship") {
      relatedNodes.add(focus.className);
    }
    for (const relationship of graph.relationships.filter((item) => relationshipMatches(item, focus))) {
      relatedNodes.add(relationship.from.nodeName);
      relatedNodes.add(relationship.to.nodeName);
    }
  }

  const classFrames = methodsHidden
    ? ""
    : graph.classes
        .map((classDiff) => {
          const box = layout.boxes.get(classDiff.name)!;
          const dimmed = focus !== undefined && !relatedNodes.has(classDiff.name);
          return `<rect class="class-frame${dimmed ? " dimmed" : ""}" data-node="${escapeHtml(classDiff.name)}" x="${box.x}" y="${box.y}" width="${box.width}" height="${box.height}" rx="11" fill="oklch(0.212 0.024 255 / 0.72)" stroke="oklch(0.4 0.032 255)" stroke-width="1.25" stroke-dasharray="6 5"></rect>`;
        })
        .join("");

  const compositionEdges = layout.compositionRelationships
    .map((relationship) => {
      const from = routingBounds.get(relationship.from.nodeName)!;
      const to = routingBounds.get(relationship.to.nodeName)!;
      const path = routeCompositionEdge(from, to, obstaclesFor(relationship));
      const dimmed = focus !== undefined && !relationshipMatches(relationship, focus);
      return `<path class="edge${dimmed ? " dimmed" : ""}" ${relationshipAttributes(relationship)} d="${path}" fill="none" stroke="oklch(0.305 0.032 255)" stroke-width="5" stroke-linecap="round" stroke-linejoin="round" marker-end="url(#composition-arrow)"></path>`;
    })
    .join("");

  const drawableRelationships = graph.relationships.filter(
    (relationship) => relationship.relationship.type !== "composition" && (!methodsHidden || !isInternalStateRelationship(relationship)),
  );
  const edgeLayouts = (methodsHidden ? mergeClassDataflows(drawableRelationships) : drawableRelationships)
    .map((relationship) => ({
      relationship,
      from: graphRect(relationship.from, routingBounds, layout.methodRects, layout.stateRects),
      to: graphRect(relationship.to, routingBounds, layout.methodRects, layout.stateRects),
    }))
    .filter((edge): edge is { relationship: ResolvedRelationship; from: Rect; to: Rect } => edge.from !== undefined && edge.to !== undefined);
  const edgeSpreads = edgePortSpreads(edgeLayouts.map((edge) => ({
    fromKey: graphEndpointKey(edge.relationship.from),
    toKey: graphEndpointKey(edge.relationship.to),
    from: edge.from,
    to: edge.to,
  })));
  const edges = edgeLayouts
    .map((edge, index) => {
      const { relationship, from, to } = edge;
      const route = routeEdge(from, to, edgeSpreads[index], obstaclesFor(relationship));
      const changeType = relationship.relationship.changeType;
      const stateUpdate = relationship.relationship.type === "state-update";
      const stateRead = relationship.relationship.type === "state-read";
      const dimmed = focus !== undefined && !relationshipMatches(relationship, focus);
      const dash = stateUpdate || stateRead ? "7 4" : changeType === "deleted" ? "7 5" : "";
      const selected = selectionKey(selection) === selectionKey({ type: "relationship", edge: edgeKey(relationship, methodsHidden) });
      return `
        <path class="edge${dimmed ? " dimmed" : ""}${selected ? " selected" : ""}" ${relationshipAttributes(relationship)} d="${route.path}" fill="none" stroke="${changeColor(changeType)}" stroke-width="${stateUpdate ? 1.75 : 1.6}" stroke-dasharray="${dash}" stroke-linecap="round" stroke-linejoin="round" marker-end="url(#arrow-${changeType})"></path>
        <circle class="edge${dimmed ? " dimmed" : ""}" ${relationshipAttributes(relationship)} cx="${route.start.x}" cy="${route.start.y}" r="3.5" fill="${changeColor(changeType)}" stroke="oklch(0.198 0.024 255)" stroke-width="1.5"></circle>
        <path class="edge-hit" ${relationshipAttributes(relationship)} data-select="relationship" d="${route.path}" fill="none" stroke="transparent" stroke-width="12" stroke-linecap="round" stroke-linejoin="round"></path>`;
    })
    .join("");

  const classTabs = graph.classes
    .map((classDiff) => {
      const box = layout.boxes.get(classDiff.name)!;
      const exposure = classExposureCount(classDiff);
      const selected = selectionKey(selection) === selectionKey({ type: "class", className: classDiff.name });
      const dimmed = focus !== undefined && !relatedNodes.has(classDiff.name);
      return `<button class="graph-node class-tab${selected ? " selected" : ""}${dimmed ? " dimmed" : ""}" style="left:${box.x + 10}px;top:${box.y - 12}px" data-select="class" data-node="${escapeHtml(classDiff.name)}" data-class="${escapeHtml(classDiff.name)}" aria-label="Inspect class ${escapeHtml(classDiff.name)}">
        <span class="class-dot" style="background:${changeColor(classDiff.changeType)}"></span>
        <span class="class-name">${escapeHtml(classDiff.name)}</span>
        <span class="exposure-badge">${exposure === null ? "?" : exposure} exp</span>
      </button>`;
    })
    .join("");

  const methods = graph.classes
    .flatMap((classDiff) =>
      methodsHidden
        ? []
        : classDiff.methods.map((method) => {
            const rect = layout.methodRects.get(methodKey(classDiff.name, method.name))!;
            const writer = stateWriters.has(methodKey(classDiff.name, method.name));
            const selected = selectionKey(selection) === selectionKey({ type: "method", className: classDiff.name, methodName: method.name });
            const dimmed = focus !== undefined && !nodeMatches(classDiff.name, method.name, focus) && !relatedNodes.has(classDiff.name);
            return `<button class="graph-node method-pill${selected ? " selected" : ""}${dimmed ? " dimmed" : ""}" style="left:${rect.x}px;top:${rect.y}px;width:${rect.width}px" data-select="method" data-node="${escapeHtml(classDiff.name)}" data-class="${escapeHtml(classDiff.name)}" data-method="${escapeHtml(method.name)}" aria-label="Inspect method ${escapeHtml(classDiff.name)}.${escapeHtml(method.name)}">
              <span class="method-accent" style="background:${changeColor(method.changeType)}"></span>
              <span class="method-glyph" style="color:${changeColor(method.changeType)}">ƒ</span>
              <span class="method-name">${escapeHtml(method.name)}</span>
              ${writer ? '<span class="state-glyph" title="Writes state">◈</span>' : ""}
            </button>`;
          }),
    )
    .join("");

  const stateBoxes = graph.classes
    .filter((classDiff) => !methodsHidden && classDiff.stateVariables.length > 0)
    .map((classDiff) => {
      const rect = layout.stateRects.get(classDiff.name)!;
      const dimmed = focus !== undefined && !relatedNodes.has(classDiff.name);
      const variables = classDiff.stateVariables
        .map((stateVariable) => `<div class="state-variable-row">
          <span class="state-variable-accent" style="background:${changeColor(stateVariable.changeType)}"></span>
          <span class="state-variable-name">${escapeHtml(stateVariable.name)}</span>
        </div>`)
        .join("");
      return `<div class="graph-node class-state-box${dimmed ? " dimmed" : ""}" style="left:${rect.x}px;top:${rect.y}px;width:${rect.width}px;height:${rect.height}px" data-node="${escapeHtml(classDiff.name)}">
        <span class="state-box-glyph" title="State variables">s</span>
        <div class="state-variable-list">${variables}</div>
      </div>`;
    })
    .join("");

  const components = graph.components
    .map((component) => {
      const box = layout.boxes.get(component.name)!;
      const selected = selectionKey(selection) === selectionKey({ type: "component", componentName: component.name });
      const dimmed = focus !== undefined && !relatedNodes.has(component.name);
      return `<button class="graph-node component-node ${component.type}${selected ? " selected" : ""}${dimmed ? " dimmed" : ""}" style="left:${box.x}px;top:${box.y}px;width:${box.width}px" data-select="component" data-node="${escapeHtml(component.name)}" data-component="${escapeHtml(component.name)}" aria-label="Inspect ${COMPONENT_LABELS[component.type]} ${escapeHtml(component.name)}">
        <span class="component-glyph">${COMPONENT_GLYPHS[component.type]}</span>
        <span class="component-copy">
          <span class="component-name">${escapeHtml(component.name)}</span>
          <span class="node-kind">${COMPONENT_LABELS[component.type]}</span>
        </span>
      </button>`;
    })
    .join("");

  const staticDataNodes = graph.staticData
    .map((entry) => {
      const box = layout.boxes.get(entry.name)!;
      const selected = selectionKey(selection) === selectionKey({ type: "static-data", staticDataName: entry.name });
      const dimmed = focus !== undefined && !relatedNodes.has(entry.name);
      return `<button class="graph-node component-node static-data${selected ? " selected" : ""}${dimmed ? " dimmed" : ""}" style="left:${box.x}px;top:${box.y}px;width:${box.width}px" data-select="static-data" data-node="${escapeHtml(entry.name)}" data-static-data="${escapeHtml(entry.name)}" aria-label="Inspect static data ${escapeHtml(entry.name)}">
        <span class="component-glyph">◆</span>
        <span class="component-copy">
          <span class="component-name">${escapeHtml(entry.name)}</span>
          <span class="node-kind">Static data</span>
        </span>
      </button>`;
    })
    .join("");

  const emptyNotes = graph.classes
    .filter((classDiff) => !methodsHidden && classDiff.methods.length === 0 && classDiff.stateVariables.length === 0)
    .map((classDiff) => {
      const box = layout.boxes.get(classDiff.name)!;
      return `<span class="graph-node empty-class" style="left:${box.x + 15}px;top:${box.y + 30}px">No visible methods</span>`;
    })
    .join("");

  queueMicrotask(() => fitGraph(layout.width));
  return `
    <div class="graph-space">
      ${graph.nodes.length === 0 ? '<div class="empty-graph">No nodes match the current filters</div>' : ""}
      <div class="graph" style="left:calc(50% + ${panX}px);top:calc(50% + ${panY}px);width:${layout.width}px;height:${layout.height}px;transform:translate(-50%, -50%) scale(${zoom})">
        <svg class="graph-svg" width="${layout.width}" height="${layout.height}">
          <defs>${renderMarkers()}</defs>
          ${classFrames}${compositionEdges}${edges}
        </svg>
        ${classTabs}${components}${staticDataNodes}${methods}${stateBoxes}${emptyNotes}
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

function inspectorHeader(eyebrow: string, title: string, changeType: ChangeType, detail?: string): string {
  return `<header class="inspector-header">
    <div class="inspector-eyebrow">${escapeHtml(eyebrow)}</div>
    <div class="inspector-title-row"><div class="inspector-title">${escapeHtml(title)}</div><button class="close-button" data-close aria-label="Clear selection">✕</button></div>
    <span class="change-chip" style="${chipStyle(changeType)}">${changeType}</span>${detail === undefined ? "" : `<span class="change-chip neutral">${escapeHtml(detail)}</span>`}
  </header>`;
}

function exposureSummary(classDiff: ClassDiff, methodName?: string): string {
  const variables = classDiff.variableExposure;
  if (variables === undefined || variables === null) return '<p class="empty-copy">Exposure inventory is unknown.</p>';
  const instance = variables.filter((variable) => variable.kind === "instance").length;
  if (methodName === undefined) {
    return `<div class="exposure-grid"><span>Instance variables</span><span>${instance}</span><span>Local variables</span><span>${variables.filter((variable) => variable.kind !== "instance").length}</span></div>`;
  }
  return `<div class="exposure-grid"><span>Class instance variables</span><span>${instance}</span><span>Local variables</span><span>${variables.filter((variable) => variable.kind !== "instance" && variable.method === methodName).length}</span></div>`;
}

function renderInspector(graph: VisibleGraph): string {
  const inspected = hovered ?? selection;
  if (inspected === undefined) {
    const stateUpdates = graph.relationships.filter((relationship) => relationship.relationship.type === "state-update");
    const maximumExposure = Math.max(1, ...graph.classes.map((classDiff) => classExposureCount(classDiff) ?? 0));
    const classes = graph.classes
      .slice()
      .sort((left, right) => (classExposureCount(right) ?? -1) - (classExposureCount(left) ?? -1))
      .map((classDiff) => {
        const count = classExposureCount(classDiff);
        const width = count === null ? 0 : (count / maximumExposure) * 100;
        return `<button class="exposure-rank" data-jump="${escapeHtml(JSON.stringify({ type: "class", className: classDiff.name }))}">
          <span class="exposure-rank-heading"><span class="exposure-rank-name">${escapeHtml(classDiff.name)}</span><span class="exposure-rank-count">${count === null ? "?" : count}</span></span>
          <span class="exposure-track"><span class="exposure-fill" style="display:block;width:${width}%"></span></span>
        </button>`;
      })
      .join("");
    const stateRows = stateUpdates.length === 0
      ? '<p class="empty-copy">None</p>'
      : `<div class="flow-list">${stateUpdates.map((relationship) => {
          const selected = selectionForEndpoint(relationship.from);
          return `<button class="flow-row state" style="border-color:${changeColor(relationship.relationship.changeType)}" data-jump="${escapeHtml(JSON.stringify(selected))}"><div class="flow-endpoint">${escapeHtml(endpointLabel(relationship.from))} ↝ ${escapeHtml(endpointLabel(relationship.to))}</div><div class="flow-label">${escapeHtml(relationship.relationship.dataDescription ?? "state update")}</div></button>`;
        }).join("")}</div>`;
    return `<div class="overview-inspector"><section class="overview-section"><div class="section-heading"><span>Variable exposure by class</span><span class="inspector-count">${graph.variableExposureCount ?? "?"}</span></div><div class="exposure-ranking">${classes}</div></section><section class="overview-section"><div class="section-heading"><span>State updates</span><span class="inspector-count">${stateUpdates.length}</span></div>${stateRows}</section></div>`;
  } else if (inspected.type === "method") {
    const methodSelection = inspected;
    const classDiff = graph.classes.find((item) => item.name === methodSelection.className)!;
    const method = classDiff.methods.find((item) => item.name === methodSelection.methodName)!;
    const inputs = graph.relationships.filter((relationship) => relationship.relationship.type === "dataflow" && endpointMatches(relationship.to, methodSelection));
    const outputs = graph.relationships.filter((relationship) => relationship.relationship.type === "dataflow" && endpointMatches(relationship.from, methodSelection));
    const stateUpdates = graph.relationships.filter((relationship) => relationship.relationship.type === "state-update" && endpointMatches(relationship.from, methodSelection));
    const inventory = classDiff.variableExposure;
    const exposureCount = inventory === undefined || inventory === null ? undefined : inventory.filter((variable) => variable.kind === "instance" || variable.method === methodSelection.methodName).length;
    return `${inspectorHeader(classDiff.name, method.name, method.changeType)}${section("Exposure in this scope", exposureSummary(classDiff, method.name), exposureCount)}${section("Data in", flowRows(inputs, "from"), inputs.length)}${section("Data out", flowRows(outputs, "to"), outputs.length)}${section("State written", flowRows(stateUpdates, "to", true), stateUpdates.length)}`;
  } else if (inspected.type === "component") {
    const component = graph.components.find((item) => item.name === inspected.componentName)!;
    const inputs = graph.relationships.filter((relationship) => relationship.relationship.type === "dataflow" && endpointMatches(relationship.to, inspected));
    const outputs = graph.relationships.filter((relationship) => relationship.relationship.type === "dataflow" && endpointMatches(relationship.from, inspected));
    return `${inspectorHeader(COMPONENT_LABELS[component.type], component.name, component.changeType)}${section("Description", `<p class="component-description">${escapeHtml(component.description)}</p>`)}${section("Data in", flowRows(inputs, "from"), inputs.length)}${section("Data out", flowRows(outputs, "to"), outputs.length)}`;
  } else if (inspected.type === "static-data") {
    const entry = graph.staticData.find((item) => item.name === inspected.staticDataName)!;
    const readers = graph.relationships.filter((relationship) => relationship.relationship.type === "dataflow" && endpointMatches(relationship.from, inspected));
    return `${inspectorHeader("Static data", entry.name, entry.changeType)}${section("Read by", flowRows(readers, "to"), readers.length)}`;
  } else if (inspected.type === "relationship") {
    const edges = relationshipsForEdge(graph, inspected.edge);
    if (edges.length === 0) {
      return `${inspectorHeader("Relationship", "Not visible", "unchanged")}<p class="empty-copy">The current filters hide this relationship.</p>`;
    }
    const arrow = (item: ResolvedRelationship) => {
      if (item.relationship.type === "state-update") {
        return "↝";
      } else if (item.relationship.type === "state-read") {
        return "⇢";
      } else {
        return "→";
      }
    };
    const merged = edges.length > 1;
    const first = edges[0];
    const entries = edges
      .map((item) => {
        const { dataDescription, purpose, changeType, userFlow } = item.relationship;
        return `<div class="relationship-entry" style="border-color:${changeColor(changeType)}">
          ${merged ? `<button class="entry-endpoints" data-jump="${escapeHtml(JSON.stringify(selectionForEndpoint(item.to)))}">${escapeHtml(endpointLabel(item.from))} ${arrow(item)} ${escapeHtml(endpointLabel(item.to))}</button><div class="entry-chips"><span class="change-chip" style="${chipStyle(changeType)}">${changeType}</span>${userFlow === undefined ? "" : `<span class="change-chip neutral">${userFlow ? "user flow" : "supporting"}</span>`}</div>` : ""}
          <div class="entry-heading">Data</div>
          <p class="entry-copy">${escapeHtml(dataDescription ?? "Not described.")}</p>
          <div class="entry-heading">Purpose</div>
          <p class="entry-copy">${escapeHtml(purpose ?? "Not described.")}</p>
        </div>`;
      })
      .join("");
    const title = merged ? `${first.from.nodeName} → ${first.to.nodeName}` : `${endpointLabel(first.from)} ${arrow(first)} ${endpointLabel(first.to)}`;
    let eyebrow = "Dataflow";
    if (merged) {
      eyebrow = "Merged relationships";
    } else if (first.relationship.type === "state-update") {
      eyebrow = "State update";
    } else if (first.relationship.type === "state-read") {
      eyebrow = "State read";
    }
    const detail = merged ? `${edges.length} relationships` : first.relationship.userFlow === undefined ? undefined : first.relationship.userFlow ? "user flow" : "supporting";
    return `${inspectorHeader(eyebrow, title, first.relationship.changeType, detail)}${section("Description", entries, merged ? edges.length : undefined)}`;
  } else {
    const classSelection = inspected;
    const classDiff = graph.classes.find((item) => item.name === classSelection.className)!;
    const stateUpdates = graph.relationships.filter((relationship) => relationship.relationship.type === "state-update" && relationship.to.nodeName === classDiff.name);
    const methods = classDiff.methods
      .map((method) => `<button class="method-row" style="border-color:${changeColor(method.changeType)}" data-jump="${escapeHtml(JSON.stringify({ type: "method", className: classDiff.name, methodName: method.name }))}"><div class="flow-endpoint">${escapeHtml(method.name)}</div><div class="flow-label">${method.changeType}</div></button>`)
      .join("");
    const exposureCount = classExposureCount(classDiff);
    return `${inspectorHeader("Class", classDiff.name, classDiff.changeType, `${exposureCount === null ? "?" : exposureCount} exposed vars`)}${section("Variable exposure", exposureSummary(classDiff), exposureCount ?? undefined)}${section("Methods", methods.length === 0 ? '<p class="empty-copy">No visible methods</p>' : `<div class="method-list">${methods}</div>`, classDiff.methods.length)}${section("Instance state written by", flowRows(stateUpdates, "from", true), stateUpdates.length)}`;
  }
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
          ${implementationDataflow.userFlows === undefined ? "" : `<button class="control-button${userFlowOnly ? " active" : ""}" data-toggle-user-flow aria-pressed="${userFlowOnly}">User flow only</button>`}
          <button class="control-button${methodsHidden ? " active" : ""}" data-toggle-methods>${methodsHidden ? "Show methods" : "Hide methods"}</button>
          <div class="zoom-controls"><button class="zoom-button" data-zoom-out aria-label="Zoom out">−</button><button class="zoom-button${userZoomed ? "" : " active"}" data-fit aria-pressed="${!userZoomed}">Fit · ${Math.round(zoom * 100)}%</button><button class="zoom-button" data-zoom-in aria-label="Zoom in">+</button></div>
        </div>
      </div>
    </header>
    <div class="workspace">
      <div class="canvas-wrap">
        <main class="canvas" aria-label="Implementation dataflow graph">${statusMessage === "" ? "" : `<div class="status-banner">${escapeHtml(statusMessage)}</div>`}${renderGraph(graph)}</main>
        <div class="change-legend">${(Object.keys(CHANGE_COLORS) as ChangeType[]).map((changeType) => `<div class="change-key"><span class="change-swatch" style="background:${changeColor(changeType)}"></span><span class="change-label">${changeType}</span></div>`).join("")}</div>
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
      if (element.dataset.select === "static-data") {
        return { type: "static-data", staticDataName: element.dataset.staticData! };
      } else if (element.dataset.select === "component") {
        return { type: "component", componentName: element.dataset.component! };
      } else if (element.dataset.select === "method") {
        return { type: "method", className: element.dataset.class!, methodName: element.dataset.method! };
      } else if (element.dataset.select === "relationship") {
        return { type: "relationship", edge: element.dataset.edge! };
      } else {
        return { type: "class", className: element.dataset.class! };
      }
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
  const userFlowToggle = app.querySelector<HTMLElement>("[data-toggle-user-flow]");
  if (userFlowToggle !== null) {
    userFlowToggle.addEventListener("click", () => {
      userFlowOnly = !userFlowOnly;
      selection = undefined;
      hovered = undefined;
      panX = 0;
      panY = 0;
      userZoomed = false;
      render();
    });
  }
  app.querySelector<HTMLElement>("[data-toggle-methods]")!.addEventListener("click", () => {
    methodsHidden = !methodsHidden;
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
  fitGraph(currentGraphWidth);
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
  const nodeName = element.getAttribute(`data-${prefix}-node`)!;
  const methodName = element.getAttribute(`data-${prefix}-method`) || undefined;
  const component = element.getAttribute(`data-${prefix}-component`) === "true";
  const staticData = element.getAttribute(`data-${prefix}-static-data`) === "true";
  return endpointMatches({ nodeName, methodName, component, staticData }, value);
}

function updateGraphFocus(value: Selection | undefined): void {
  value = graphFocus(value);
  const relationships = visibleGraph().relationships;
  const relatedNodes = new Set<string>();
  const relatedMethods = new Set<string>();
  if (value !== undefined) {
    if (value.type === "static-data") {
      relatedNodes.add(value.staticDataName);
    } else if (value.type === "component") {
      relatedNodes.add(value.componentName);
    } else if (value.type === "method") {
      relatedNodes.add(value.className);
      relatedMethods.add(methodKey(value.className, value.methodName));
    } else if (value.type === "class") {
      relatedNodes.add(value.className);
    }
    for (const relationship of relationships.filter((item) => relationshipMatches(item, value))) {
      relatedNodes.add(relationship.from.nodeName);
      relatedNodes.add(relationship.to.nodeName);
      if (relationship.from.methodName !== undefined) relatedMethods.add(methodKey(relationship.from.nodeName, relationship.from.methodName));
      if (relationship.to.methodName !== undefined) relatedMethods.add(methodKey(relationship.to.nodeName, relationship.to.methodName));
    }
  }
  for (const element of app.querySelectorAll<HTMLElement>(".graph-node[data-node]")) {
    const exactMethod = element.dataset.method === undefined || relatedMethods.has(methodKey(element.dataset.node!, element.dataset.method));
    const selectedClass = value?.type === "class" && value.className === element.dataset.node;
    element.classList.toggle("dimmed", value !== undefined && (!relatedNodes.has(element.dataset.node!) || (!exactMethod && !selectedClass)));
  }
  for (const element of app.querySelectorAll<SVGElement>(".class-frame[data-node]")) {
    element.classList.toggle("dimmed", value !== undefined && !relatedNodes.has(element.dataset.node!));
  }
  for (const element of app.querySelectorAll<SVGElement>("[data-relation]")) {
    const relevant = value !== undefined && (value.type === "relationship"
      ? element.getAttribute("data-edge") === value.edge
      : endpointDatasetMatches(element, "from", value) || endpointDatasetMatches(element, "to", value));
    element.classList.toggle("dimmed", value !== undefined && !relevant);
  }
}

function fitGraph(graphWidth: number): void {
  if (!userZoomed) {
    const canvas = app.querySelector<HTMLElement>(".canvas");
    if (canvas !== null) {
      const nextZoom = Math.min(1, Math.max(0.15, (canvas.clientWidth - 112) / graphWidth));
      if (Math.abs(nextZoom - zoom) >= 0.01) {
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
      if (implementationDataflow.userFlows === undefined) userFlowOnly = false;
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

void openDefaultFile();
observer.observe(app);
