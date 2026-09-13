import Ajv2020, { type ErrorObject } from "ajv/dist/2020.js";
import architectureDiffSchema from "../../references/architecture-diff.schema.json";
import exampleDiff from "../workbook-import-hld.architecture-diff.json";
import { computeLayout, routeEdge } from "./layout";
import "./styles.css";
import type {
  ArchitectureDiff,
  ChangeType,
  ClassDiff,
  ComponentDiff,
  GraphNode,
  Rect,
  ResolvedEndpoint,
  ResolvedRelationship,
  Selection,
} from "./types";
import { methodKey, resolveEndpoint } from "./types";

const app = document.querySelector<HTMLDivElement>("#app")!;
const ajv = new Ajv2020({ allErrors: true });
const validate = ajv.compile(architectureDiffSchema);
const measureContext = document.createElement("canvas").getContext("2d")!;

const CHANGE_COLORS: Record<ChangeType, string> = {
  added: "oklch(0.76 0.16 155)",
  modified: "oklch(0.82 0.15 82)",
  deleted: "oklch(0.72 0.18 25)",
  unchanged: "oklch(0.56 0.02 250)",
};

let diff = exampleDiff as ArchitectureDiff;
let fileName = "workbook-import-hld.architecture-diff.json";
let showUnchanged = true;
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
  } else if (classDiff.variableExposure === null) {
    return null;
  } else {
    return classDiff.variableExposure.length;
  }
}

function exposureCountForClasses(classes: ClassDiff[]): number | "?" {
  if (classes.some((classDiff) => classDiff.variableExposure === null)) {
    return "?";
  }
  return new Set(
    classes.flatMap((classDiff) =>
      classDiff.variableExposure!
        .filter(
          (variable) =>
            variable.kind === "instance" || classDiff.methods.some((method) => method.name === variable.method),
        )
        .map((variable) =>
          JSON.stringify([variable.declaredAt.file, variable.declaredAt.line, variable.declaredAt.column]),
        ),
    ),
  ).size;
}

function endpointLabel(endpoint: ResolvedEndpoint): string {
  if (endpoint.component) {
    return endpoint.nodeName;
  } else if (endpoint.methodName !== undefined) {
    return `${endpoint.nodeName}.${endpoint.methodName}`;
  } else {
    return endpoint.nodeName;
  }
}

function selectionForEndpoint(endpoint: ResolvedEndpoint): Selection {
  if (endpoint.component) {
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
  } else if (value.type === "component") {
    return `component:${value.componentName}`;
  } else if (value.type === "method") {
    return `method:${value.className}:${value.methodName}`;
  } else {
    return `class:${value.className}`;
  }
}

function endpointMatches(endpoint: ResolvedEndpoint, value: Selection): boolean {
  if (value.type === "component") {
    return endpoint.component && endpoint.nodeName === value.componentName;
  } else if (value.type === "method") {
    return !endpoint.component && endpoint.nodeName === value.className && endpoint.methodName === value.methodName;
  } else {
    return !endpoint.component && endpoint.nodeName === value.className;
  }
}

function relationshipMatches(relationship: ResolvedRelationship, value: Selection | undefined): boolean {
  return value !== undefined && (endpointMatches(relationship.from, value) || endpointMatches(relationship.to, value));
}

function nodeMatches(nodeName: string, methodName: string | undefined, value: Selection | undefined): boolean {
  if (value === undefined) {
    return true;
  } else if (value.type === "component") {
    return nodeName === value.componentName;
  } else if (value.type === "method") {
    return nodeName === value.className && (methodName === undefined || methodName === value.methodName);
  } else {
    return nodeName === value.className;
  }
}

function relationshipAttributes(relationship: ResolvedRelationship): string {
  return `data-relation data-from-node="${escapeHtml(relationship.from.nodeName)}" data-from-method="${escapeHtml(relationship.from.methodName ?? "")}" data-from-component="${relationship.from.component}" data-to-node="${escapeHtml(relationship.to.nodeName)}" data-to-method="${escapeHtml(relationship.to.methodName ?? "")}" data-to-component="${relationship.to.component}"`;
}

function visibleGraph(): {
  classes: ClassDiff[];
  components: ComponentDiff[];
  nodes: GraphNode[];
  relationships: ResolvedRelationship[];
} {
  const classes = diff.classes
    .filter((classDiff) => showUnchanged || classDiff.changeType !== "unchanged")
    .map((classDiff) => ({
      ...classDiff,
      methods: classDiff.methods.filter((method) => showUnchanged || method.changeType !== "unchanged"),
    }));
  const components = diff.components.filter((component) => showUnchanged || component.changeType !== "unchanged");
  const nodes: GraphNode[] = [
    ...classes.map((classDiff) => ({
      name: classDiff.name,
      changeType: classDiff.changeType,
      methods: classDiff.methods,
    })),
    ...components.map((component) => ({
      name: component.name,
      changeType: component.changeType,
      methods: [],
      componentType: component.type,
    })),
  ];
  const classNames = new Set(classes.map((classDiff) => classDiff.name));
  const componentNames = new Set(components.map((component) => component.name));
  const methodNames = new Set(classes.flatMap((classDiff) => classDiff.methods.map((method) => methodKey(classDiff.name, method.name))));
  const endpointVisible = (endpoint: ResolvedEndpoint) => {
    if (endpoint.component) {
      return componentNames.has(endpoint.nodeName);
    } else if (endpoint.methodName !== undefined) {
      return classNames.has(endpoint.nodeName) && methodNames.has(methodKey(endpoint.nodeName, endpoint.methodName));
    } else {
      return classNames.has(endpoint.nodeName);
    }
  };
  const relationships = diff.relationships
    .filter((relationship) => showUnchanged || relationship.changeType !== "unchanged")
    .map((relationship) => ({
      relationship,
      from: resolveEndpoint(relationship.from),
      to: resolveEndpoint(relationship.to),
    }))
    .filter((relationship) => endpointVisible(relationship.from) && endpointVisible(relationship.to));
  return { classes, components, nodes, relationships };
}

function graphRect(endpoint: ResolvedEndpoint, boxes: Map<string, Rect>, methodRects: Map<string, Rect>): Rect | undefined {
  if (endpoint.methodName !== undefined && !methodsHidden) {
    return methodRects.get(methodKey(endpoint.nodeName, endpoint.methodName));
  }
  return boxes.get(endpoint.nodeName);
}

function classTargetRect(classDiff: ClassDiff, box: Rect): Rect {
  return { x: box.x + 10, y: box.y - 12, width: tabWidth(classDiff), height: 24 };
}

function renderMarkers(): string {
  const changeMarkers = (Object.keys(CHANGE_COLORS) as ChangeType[])
    .map(
      (changeType) => `
        <marker id="arrow-${changeType}" viewBox="0 0 8 8" refX="6" refY="4" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
          <path d="M 0 1 L 7 4 L 0 7 z" fill="${changeColor(changeType)}"></path>
        </marker>
        <marker id="state-${changeType}" viewBox="0 0 8 8" refX="4" refY="4" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
          <rect x="1.5" y="1.5" width="5" height="5" rx="1" fill="${changeColor(changeType)}"></rect>
        </marker>`,
    )
    .join("");
  return `${changeMarkers}
    <marker id="composition-arrow" viewBox="0 0 8 8" refX="7" refY="4" markerWidth="16" markerHeight="16" markerUnits="userSpaceOnUse" orient="auto">
      <path d="M 0 0 L 7 4 L 0 8 z" fill="oklch(0.305 0.032 255)"></path>
    </marker>`;
}

function renderGraph(): string {
  const graph = visibleGraph();
  const stateWriters = new Set(
    graph.relationships
      .filter((relationship) => relationship.relationship.type === "state-update" && relationship.from.methodName !== undefined)
      .map((relationship) => methodKey(relationship.from.nodeName, relationship.from.methodName!)),
  );
  const layout = computeLayout(graph.nodes, graph.relationships, methodsHidden, methodWidth, componentWidth, stateWriters);
  currentGraphWidth = layout.width;
  const classByName = new Map(graph.classes.map((classDiff) => [classDiff.name, classDiff]));
  const focus = hovered ?? selection;

  const relatedNodes = new Set<string>();
  if (focus !== undefined) {
    if (focus.type === "component") {
      relatedNodes.add(focus.componentName);
    } else {
      relatedNodes.add(focus.className);
    }
    for (const relationship of graph.relationships.filter((item) => relationshipMatches(item, focus))) {
      relatedNodes.add(relationship.from.nodeName);
      relatedNodes.add(relationship.to.nodeName);
    }
  }

  const classFrames = graph.classes
    .map((classDiff) => {
      const box = layout.boxes.get(classDiff.name)!;
      const dimmed = focus !== undefined && !relatedNodes.has(classDiff.name);
      return `<rect class="class-frame${dimmed ? " dimmed" : ""}" data-node="${escapeHtml(classDiff.name)}" x="${box.x}" y="${box.y}" width="${box.width}" height="${box.height}" rx="11" fill="oklch(0.212 0.024 255 / 0.72)" stroke="oklch(0.4 0.032 255)" stroke-width="1.25" stroke-dasharray="6 5"></rect>`;
    })
    .join("");

  const compositionEdges = layout.compositionRelationships
    .map((relationship) => {
      const from = layout.boxes.get(relationship.from.nodeName)!;
      const to = layout.boxes.get(relationship.to.nodeName)!;
      const sx = from.x + from.width / 2;
      const sy = from.y + from.height;
      const ex = to.x + to.width / 2;
      const ey = to.y - (relationship.to.component ? 0 : 12);
      const mid = sy + Math.max(30, (ey - sy) / 2);
      const dimmed = focus !== undefined && !relationshipMatches(relationship, focus);
      return `<path class="edge${dimmed ? " dimmed" : ""}" ${relationshipAttributes(relationship)} d="M ${sx} ${sy} L ${sx} ${mid} L ${ex} ${mid} L ${ex} ${ey}" fill="none" stroke="oklch(0.305 0.032 255)" stroke-width="5" stroke-linecap="round" stroke-linejoin="round" marker-end="url(#composition-arrow)"></path>`;
    })
    .join("");

  const drawableRelationships = graph.relationships.filter((relationship) => relationship.relationship.type !== "composition");
  const edges = drawableRelationships
    .map((relationship, index) => {
      const from = graphRect(relationship.from, layout.boxes, layout.methodRects);
      let to = graphRect(relationship.to, layout.boxes, layout.methodRects);
      if (relationship.relationship.type === "state-update") {
        const targetClass = classByName.get(relationship.to.nodeName)!;
        to = classTargetRect(targetClass, layout.boxes.get(relationship.to.nodeName)!);
      }
      if (from === undefined || to === undefined) return "";
      const spread = ((index % 5) - 2) * 4;
      const route = routeEdge(from, to, spread);
      const changeType = relationship.relationship.changeType;
      const stateUpdate = relationship.relationship.type === "state-update";
      const dimmed = focus !== undefined && !relationshipMatches(relationship, focus);
      const dash = stateUpdate ? "2 5" : changeType === "deleted" ? "7 5" : "";
      const marker = stateUpdate ? `state-${changeType}` : `arrow-${changeType}`;
      return `
        <path class="edge${dimmed ? " dimmed" : ""}" ${relationshipAttributes(relationship)} d="${route.path}" fill="none" stroke="${changeColor(changeType)}" stroke-width="${stateUpdate ? 1.75 : 1.6}" stroke-dasharray="${dash}" stroke-linecap="round" marker-end="url(#${marker})"></path>
        <circle class="edge${dimmed ? " dimmed" : ""}" ${relationshipAttributes(relationship)} cx="${route.start.x}" cy="${route.start.y}" r="3.5" fill="${changeColor(changeType)}" stroke="oklch(0.198 0.024 255)" stroke-width="1.5"></circle>`;
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

  const components = graph.components
    .map((component) => {
      const box = layout.boxes.get(component.name)!;
      const selected = selectionKey(selection) === selectionKey({ type: "component", componentName: component.name });
      const dimmed = focus !== undefined && !relatedNodes.has(component.name);
      return `<button class="graph-node component-node ${component.type}${selected ? " selected" : ""}${dimmed ? " dimmed" : ""}" style="left:${box.x}px;top:${box.y}px;width:${box.width}px" data-select="component" data-node="${escapeHtml(component.name)}" data-component="${escapeHtml(component.name)}" aria-label="Inspect ${component.type} component ${escapeHtml(component.name)}">
        <span class="component-glyph">${component.type === "ui" ? "▣" : "⇅"}</span>
        <span class="component-copy">
          <span class="component-name">${escapeHtml(component.name)}</span>
          <span class="node-kind">${component.type === "ui" ? "UI component" : "External I/O"}</span>
        </span>
      </button>`;
    })
    .join("");

  const emptyNotes = graph.classes
    .filter((classDiff) => !methodsHidden && classDiff.methods.length === 0)
    .map((classDiff) => {
      const box = layout.boxes.get(classDiff.name)!;
      return `<span class="graph-node empty-class" style="left:${box.x + 15}px;top:${box.y + 30}px">No methods in diff</span>`;
    })
    .join("");

  queueMicrotask(() => fitGraph(layout.width));
  return `
    <div class="graph-space">
      ${graph.nodes.length === 0 ? '<div class="empty-graph">No changed nodes to display</div>' : ""}
      <div class="graph" style="left:calc(50% + ${panX}px);top:calc(50% + ${panY}px);width:${layout.width}px;height:${layout.height}px;transform:translate(-50%, -50%) scale(${zoom})">
        <svg class="graph-svg" width="${layout.width}" height="${layout.height}">
          <defs>${renderMarkers()}</defs>
          ${classFrames}${compositionEdges}${edges}
        </svg>
        ${classTabs}${components}${methods}${emptyNotes}
      </div>
    </div>`;
}

function flowRows(relationships: ResolvedRelationship[], endpoint: "from" | "to", state = false): string {
  if (relationships.length === 0) return '<p class="empty-copy">None</p>';
  return `<div class="flow-list">${relationships
    .map((relationship) => {
      const other = endpoint === "from" ? relationship.from : relationship.to;
      const selected = selectionForEndpoint(other);
      return `<button class="flow-row${state ? " state" : ""}" style="border-color:${changeColor(relationship.relationship.changeType)}" data-jump="${escapeHtml(JSON.stringify(selected))}">
        <div class="flow-endpoint">${endpoint === "to" && !state ? "→ " : ""}${escapeHtml(endpointLabel(other))}</div>
        <div class="flow-label">${escapeHtml(relationship.relationship.label ?? relationship.relationship.type)}</div>
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

function resolvedRelationships(): ResolvedRelationship[] {
  return diff.relationships.map((relationship) => ({
    relationship,
    from: resolveEndpoint(relationship.from),
    to: resolveEndpoint(relationship.to),
  }));
}

function exposureSummary(classDiff: ClassDiff, methodName?: string): string {
  const variables = classDiff.variableExposure;
  if (variables === null) return '<p class="empty-copy">Exposure inventory is unknown.</p>';
  const instance = variables.filter((variable) => variable.kind === "instance").length;
  if (methodName === undefined) {
    return `<div class="exposure-grid"><span>Instance variables</span><span>${instance}</span><span>Local variables</span><span>${variables.filter((variable) => variable.kind !== "instance").length}</span></div>`;
  }
  return `<div class="exposure-grid"><span>Class instance variables</span><span>${instance}</span><span>Local variables</span><span>${variables.filter((variable) => variable.kind !== "instance" && variable.method === methodName).length}</span></div>`;
}

function renderInspector(): string {
  const relationships = resolvedRelationships();
  if (selection === undefined) {
    const stateUpdates = relationships.filter((relationship) => relationship.relationship.type === "state-update");
    const maximumExposure = Math.max(1, ...diff.classes.map((classDiff) => classExposureCount(classDiff) ?? 0));
    const classes = diff.classes
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
          return `<button class="flow-row state" style="border-color:${changeColor(relationship.relationship.changeType)}" data-jump="${escapeHtml(JSON.stringify(selected))}"><div class="flow-endpoint">${escapeHtml(endpointLabel(relationship.from))} ↝ ${escapeHtml(endpointLabel(relationship.to))}</div><div class="flow-label">${escapeHtml(relationship.relationship.label ?? "state update")}</div></button>`;
        }).join("")}</div>`;
    return `<div class="overview-inspector"><section class="overview-section"><div class="section-heading"><span>Variable exposure by class</span><span class="inspector-count">${diff.variableExposureCount ?? "?"}</span></div><div class="exposure-ranking">${classes}</div></section><section class="overview-section"><div class="section-heading"><span>State updates</span><span class="inspector-count">${stateUpdates.length}</span></div>${stateRows}</section></div>`;
  } else if (selection.type === "method") {
    const methodSelection = selection;
    const classDiff = diff.classes.find((item) => item.name === methodSelection.className)!;
    const method = classDiff.methods.find((item) => item.name === methodSelection.methodName)!;
    const inputs = relationships.filter((relationship) => relationship.relationship.type === "dataflow" && endpointMatches(relationship.to, methodSelection));
    const outputs = relationships.filter((relationship) => relationship.relationship.type === "dataflow" && endpointMatches(relationship.from, methodSelection));
    const stateUpdates = relationships.filter((relationship) => relationship.relationship.type === "state-update" && endpointMatches(relationship.from, methodSelection));
    const inventory = classDiff.variableExposure;
    const exposureCount = inventory === null ? undefined : inventory.filter((variable) => variable.kind === "instance" || variable.method === methodSelection.methodName).length;
    return `${inspectorHeader(classDiff.name, method.name, method.changeType)}${section("Data in", flowRows(inputs, "from"), inputs.length)}${section("Data out", flowRows(outputs, "to"), outputs.length)}${section("State written", flowRows(stateUpdates, "to", true), stateUpdates.length)}${section("Exposure in this scope", exposureSummary(classDiff, method.name), exposureCount)}`;
  } else if (selection.type === "component") {
    const componentSelection = selection;
    const component = diff.components.find((item) => item.name === componentSelection.componentName)!;
    const inputs = relationships.filter((relationship) => relationship.relationship.type === "dataflow" && endpointMatches(relationship.to, componentSelection));
    const outputs = relationships.filter((relationship) => relationship.relationship.type === "dataflow" && endpointMatches(relationship.from, componentSelection));
    return `${inspectorHeader(component.type === "ui" ? "UI component" : "External I/O", component.name, component.changeType)}${section("Data in", flowRows(inputs, "from"), inputs.length)}${section("Data out", flowRows(outputs, "to"), outputs.length)}`;
  } else {
    const classSelection = selection;
    const classDiff = diff.classes.find((item) => item.name === classSelection.className)!;
    const stateUpdates = relationships.filter((relationship) => relationship.relationship.type === "state-update" && relationship.to.nodeName === classDiff.name);
    const methods = classDiff.methods
      .map((method) => `<button class="method-row" style="border-color:${changeColor(method.changeType)}" data-jump="${escapeHtml(JSON.stringify({ type: "method", className: classDiff.name, methodName: method.name }))}"><div class="flow-endpoint">${escapeHtml(method.name)}</div><div class="flow-label">${method.changeType}</div></button>`)
      .join("");
    const exposureCount = classExposureCount(classDiff);
    return `${inspectorHeader("Class", classDiff.name, classDiff.changeType, `${exposureCount === null ? "?" : exposureCount} exposed vars`)}${section("Methods", methods.length === 0 ? '<p class="empty-copy">No methods in diff</p>' : `<div class="method-list">${methods}</div>`, classDiff.methods.length)}${section("Instance state written by", flowRows(stateUpdates, "from", true), stateUpdates.length)}${section("Variable exposure", exposureSummary(classDiff), exposureCount ?? undefined)}`;
  }
}

function shapeLegend(): string {
  return `<div class="graph-legend" aria-hidden="true">
    <div class="shape-key"><span class="shape-sample"></span><span>class</span></div>
    <div class="shape-key"><span class="shape-sample method"></span><span>method</span></div>
    <div class="shape-key"><span class="shape-sample ui"></span><span>ui</span></div>
    <div class="shape-key"><span class="shape-sample io"></span><span>external i/o</span></div>
    <div class="shape-key"><svg width="26" height="14"><path d="M 1 10 C 9 10 12 4 25 4" fill="none" stroke="var(--added)" stroke-width="1.6"></path><path d="M 19 1.4 L 25 4 L 19 6.6 z" fill="var(--added)"></path></svg><span>data flow</span></div>
    <div class="shape-key"><svg width="26" height="14"><path d="M 1 7 L 19 7" fill="none" stroke="var(--accent)" stroke-width="1.6" stroke-dasharray="2 4"></path><rect x="20" y="4.2" width="5.4" height="5.4" rx="1" fill="var(--accent)"></rect></svg><span>state update</span></div>
    <div class="shape-key"><svg width="26" height="14"><path d="M 13 1 L 13 6 M 3 6 L 23 6 M 3 6 L 3 10 M 23 6 L 23 10" fill="none" stroke="oklch(0.4 0.032 255)" stroke-width="2.4" stroke-linecap="round"></path><path d="M 0 9 L 3 14 L 6 9 z M 20 9 L 23 14 L 26 9 z" fill="oklch(0.4 0.032 255)"></path></svg><span>composition</span></div>
  </div>`;
}

function render(): void {
  const graph = visibleGraph();
  const methods = graph.classes.reduce((count, classDiff) => count + classDiff.methods.length, 0);
  const dataflows = graph.relationships.filter((relationship) => relationship.relationship.type === "dataflow").length;
  const stateUpdates = graph.relationships.filter((relationship) => relationship.relationship.type === "state-update").length;
  const metrics = [
    [methods, "methods"],
    [dataflows, "dataflows"],
    [stateUpdates, "state updates"],
    [graph.components.length, "ui / io"],
    [exposureCountForClasses(graph.classes), "exposed vars"],
  ];
  app.innerHTML = `<div class="app-shell">
    <header class="topbar">
      <div class="summary-row">
        <div class="brand"><span class="brand-title">Architecture Diff</span><span class="stage-chip">${escapeHtml(diff.stage)}</span><span class="schema-label">schema v${diff.schemaVersion}</span><span class="file-label" title="${escapeHtml(fileName)}">${escapeHtml(fileName)}</span></div>
        <div class="metrics">${metrics.map(([value, label]) => `<div class="metric"><span class="metric-value">${value}</span><span class="metric-label">${label}</span></div>`).join("")}</div>
      </div>
      <div class="controls-row">
        <div class="change-legend">${(Object.keys(CHANGE_COLORS) as ChangeType[]).map((changeType) => `<div class="change-key"><span class="change-swatch" style="background:${changeColor(changeType)}"></span><span class="change-label">${changeType}</span></div>`).join("")}</div>
        <div class="control-group">
          <button class="control-button" data-open>Open JSON</button>
          <button class="control-button${showUnchanged ? "" : " active"}" data-toggle-unchanged>Hide unchanged</button>
          <button class="control-button${methodsHidden ? " active" : ""}" data-toggle-methods>${methodsHidden ? "Show methods" : "Hide methods"}</button>
          <div class="zoom-controls"><button class="zoom-button" data-zoom-out aria-label="Zoom out">−</button><button class="zoom-button${userZoomed ? "" : " active"}" data-fit aria-pressed="${!userZoomed}">Fit · ${Math.round(zoom * 100)}%</button><button class="zoom-button" data-zoom-in aria-label="Zoom in">+</button></div>
        </div>
      </div>
    </header>
    <div class="workspace">
      <div class="canvas-wrap">
        <main class="canvas" aria-label="Architecture diff graph">${statusMessage === "" ? "" : `<div class="status-banner">${escapeHtml(statusMessage)}</div>`}${renderGraph()}</main>
        ${shapeLegend()}
        ${dragDepth > 0 ? '<div class="drop-overlay">Drop an architecture-diff.json file</div>' : ""}
      </div>
      <div class="inspector-resizer" data-inspector-resizer role="separator" aria-label="Resize inspector" aria-orientation="vertical" aria-valuenow="${Math.round(inspectorWidth)}" tabindex="0"></div>
      <aside class="inspector" style="width:${inspectorWidth}px;flex-basis:${inspectorWidth}px" aria-label="Architecture inspector">${renderInspector()}</aside>
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
    const select = () => {
      if (element.dataset.select === "component") {
        selection = { type: "component", componentName: element.dataset.component! };
      } else if (element.dataset.select === "method") {
        selection = { type: "method", className: element.dataset.class!, methodName: element.dataset.method! };
      } else {
        selection = { type: "class", className: element.dataset.class! };
      }
      render();
    };
    element.addEventListener("click", (event) => {
      event.stopPropagation();
      select();
    });
    element.addEventListener("mouseenter", () => {
      if (element.dataset.select === "component") {
        hovered = { type: "component", componentName: element.dataset.component! };
      } else if (element.dataset.select === "method") {
        hovered = { type: "method", className: element.dataset.class!, methodName: element.dataset.method! };
      } else {
        hovered = { type: "class", className: element.dataset.class! };
      }
      updateGraphFocus(hovered);
    });
    element.addEventListener("mouseleave", () => {
      hovered = undefined;
      updateGraphFocus(selection);
    });
  }
  for (const element of app.querySelectorAll<HTMLElement>("[data-jump]")) {
    element.addEventListener("click", () => {
      selection = JSON.parse(element.dataset.jump!) as Selection;
      render();
    });
  }
  app.querySelector<HTMLElement>("[data-close]")?.addEventListener("click", () => {
    selection = undefined;
    render();
  });
  app.querySelector<HTMLElement>("[data-toggle-unchanged]")!.addEventListener("click", () => {
    showUnchanged = !showUnchanged;
    selection = undefined;
    panX = 0;
    panY = 0;
    userZoomed = false;
    render();
  });
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
  app.querySelector<HTMLElement>("[data-open]")!.addEventListener("click", () => input.click());
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
  return endpointMatches({ nodeName, methodName, component }, value);
}

function updateGraphFocus(value: Selection | undefined): void {
  const relationships = visibleGraph().relationships;
  const relatedNodes = new Set<string>();
  const relatedMethods = new Set<string>();
  if (value !== undefined) {
    const ownNode = value.type === "component" ? value.componentName : value.className;
    relatedNodes.add(ownNode);
    if (value.type === "method") relatedMethods.add(methodKey(value.className, value.methodName));
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
    const relevant = value !== undefined && (endpointDatasetMatches(element, "from", value) || endpointDatasetMatches(element, "to", value));
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

function semanticError(value: ArchitectureDiff): string | undefined {
  const names = [...value.classes.map((classDiff) => classDiff.name), ...value.components.map((component) => component.name)];
  if (new Set(names).size !== names.length) {
    return "Class and component names must be unique.";
  }
  const classes = new Map(value.classes.map((classDiff) => [classDiff.name, new Set(classDiff.methods.map((method) => method.name))]));
  const components = new Set(value.components.map((component) => component.name));
  for (const classDiff of value.classes) {
    if (new Set(classDiff.methods.map((method) => method.name)).size !== classDiff.methods.length) {
      return `Method names in “${classDiff.name}” must be unique.`;
    }
  }
  for (const relationship of value.relationships) {
    for (const endpoint of [relationship.from, relationship.to]) {
      const resolved = resolveEndpoint(endpoint);
      if (resolved.component && !components.has(resolved.nodeName)) {
        return `Relationship references unknown component “${resolved.nodeName}”.`;
      } else if (!resolved.component && !classes.has(resolved.nodeName)) {
        return `Relationship references unknown class “${resolved.nodeName}”.`;
      } else if (!resolved.component && resolved.methodName !== undefined && !classes.get(resolved.nodeName)!.has(resolved.methodName)) {
        return `Relationship references unknown method “${resolved.nodeName}.${resolved.methodName}”.`;
      }
    }
  }
  return undefined;
}

async function openFile(file: File): Promise<void> {
  try {
    const value: unknown = JSON.parse(await file.text());
    if (!validate(value)) {
      statusMessage = `Could not open ${file.name}: ${validationMessage(validate.errors)}`;
    } else {
      const architectureDiff = value as unknown as ArchitectureDiff;
      const error = semanticError(architectureDiff);
      if (error !== undefined) {
        statusMessage = `Could not open ${file.name}: ${error}`;
      } else {
        diff = architectureDiff;
        fileName = file.name;
        selection = undefined;
        hovered = undefined;
        panX = 0;
        panY = 0;
        statusMessage = "";
        userZoomed = false;
      }
    }
  } catch (error) {
    statusMessage = `Could not open ${file.name}: ${error instanceof Error ? error.message : String(error)}`;
  }
  render();
}

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

const observer = new ResizeObserver(() => {
  if (!userZoomed) render();
});

render();
observer.observe(app);
