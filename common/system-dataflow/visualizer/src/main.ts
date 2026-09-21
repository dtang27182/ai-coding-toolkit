import Ajv2020, { type ErrorObject } from "ajv/dist/2020.js";
import schema from "../../system-dataflow.schema.json";
import example from "../../system-dataflow.example.json";
import { computeLayout } from "./layout.ts";
import { routeEdge } from "./routing.ts";
import type {
  ChangeType,
  Selection,
  SystemDataflow,
  SystemDataflowNode,
  SystemDataflowRelationship,
} from "./types.ts";
import { semanticError } from "./validation.ts";
import "./styles.css";

type DisplayChangeType = ChangeType | "unspecified";
type NodeTypeKey = "system-input" | "system-output" | "system-state" | "static-data" | "data-processing" | "system-input-output";

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

const NODE_TYPES: Record<NodeTypeKey, { label: string; shortLabel: string; glyph: string; color: string }> = {
  "system-input": { label: "System input", shortLabel: "Input", glyph: "↘", color: "oklch(0.78 0.12 225)" },
  "system-output": { label: "System output", shortLabel: "Output", glyph: "↗", color: "oklch(0.74 0.15 315)" },
  "system-input-output": { label: "System input + output", shortLabel: "Input + output", glyph: "⇄", color: "oklch(0.76 0.13 270)" },
  "system-state": { label: "System state", shortLabel: "State", glyph: "◆", color: "oklch(0.78 0.14 55)" },
  "static-data": { label: "Static data", shortLabel: "Static", glyph: "▤", color: "oklch(0.82 0.12 100)" },
  "data-processing": { label: "Data processing", shortLabel: "Processing", glyph: "ƒ", color: "oklch(0.76 0.14 155)" },
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

function nodeTypeKey(node: SystemDataflowNode): NodeTypeKey {
  if (Array.isArray(node.type)) {
    return "system-input-output";
  } else {
    return node.type;
  }
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

  const edges = graph.relationships
    .map((relationship, index) => {
      const from = layout.boxes.get(relationship.from);
      const to = layout.boxes.get(relationship.to);
      if (from === undefined || to === undefined) return "";
      const obstacles = [...layout.boxes]
        .filter(([name]) => name !== relationship.from && name !== relationship.to)
        .map(([, box]) => box);
      const route = routeEdge(from, to, ((index % 5) - 2) * 4, obstacles);
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
      const type = NODE_TYPES[nodeTypeKey(node)];
      const selected = selectionKey(selection) === selectionKey({ type: "node", name: node.name });
      const dimmed = focus !== undefined && !relatedNodes.has(node.name);
      return `<button class="graph-node type-${nodeTypeKey(node)}${selected ? " selected" : ""}${dimmed ? " dimmed" : ""}" style="left:${box.x}px;top:${box.y}px;width:${box.width}px;height:${box.height}px;--type-color:${type.color};--change-color:${changeColor(node.changeType)}" data-select="node" data-node="${escapeHtml(node.name)}" aria-label="Inspect ${escapeHtml(type.label)} ${escapeHtml(node.name)}">
        <span class="change-stripe"></span>
        <span class="node-glyph">${type.glyph}</span>
        <span class="node-copy">
          <span class="node-type">${escapeHtml(type.label)}</span>
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

function section(title: string, content: string, count?: number): string {
  return `<section class="inspector-section"><div class="section-heading"><span>${escapeHtml(title)}</span>${count === undefined ? "" : `<span class="inspector-count">${count}</span>`}</div>${content}</section>`;
}

function inspectorHeader(eyebrow: string, title: string, changeType?: ChangeType, detail?: string): string {
  return `<header class="inspector-header">
    <div class="inspector-eyebrow">${escapeHtml(eyebrow)}</div>
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
  const counts = new Map<NodeTypeKey, number>();
  for (const node of graph.nodes) counts.set(nodeTypeKey(node), (counts.get(nodeTypeKey(node)) ?? 0) + 1);
  const typeRows = (Object.keys(NODE_TYPES) as NodeTypeKey[])
    .filter((type) => (counts.get(type) ?? 0) > 0)
    .map((type) => `<div class="type-count"><span class="type-dot" style="background:${NODE_TYPES[type].color}"></span><span>${escapeHtml(NODE_TYPES[type].label)}</span><strong>${counts.get(type)}</strong></div>`)
    .join("");
  return `<div class="overview">
    <div class="overview-kicker">System dataflow</div>
    <h1>${escapeHtml(dataflow.feature)}</h1>
    <p>Select a node or connection to inspect its role in the flow.</p>
    <div class="overview-counts"><div><strong>${graph.nodes.length}</strong><span>nodes</span></div><div><strong>${graph.relationships.length}</strong><span>dataflows</span></div></div>
    <div class="type-counts">${typeRows}</div>
  </div>`;
}

function renderInspector(): string {
  const inspected = hovered ?? selection;
  if (inspected === undefined) {
    return renderOverview();
  } else if (inspected.type === "node") {
    const node = dataflow.nodes.find((item) => item.name === inspected.name)!;
    const type = NODE_TYPES[nodeTypeKey(node)];
    const incoming = dataflow.relationships.filter((relationship) => relationship.to === node.name);
    const outgoing = dataflow.relationships.filter((relationship) => relationship.from === node.name);
    const algorithm = node.algorithm === undefined ? "" : section("Algorithm", `<pre class="algorithm">${escapeHtml(node.algorithm)}</pre>`);
    return `${inspectorHeader(type.label, node.name, node.changeType, node.medium)}
      ${section("Responsibility", `<p class="entry-copy">${escapeHtml(node.description)}</p>`)}
      ${section("Location", `<p class="location-copy">${escapeHtml(node.location)}</p>`)}
      ${algorithm}
      ${section("Data in", relationshipRows(incoming, "in"), incoming.length)}
      ${section("Data out", relationshipRows(outgoing, "out"), outgoing.length)}`;
  } else {
    const relationship = dataflow.relationships.find((item) => item.id === inspected.id)!;
    return `${inspectorHeader("Dataflow", `${relationship.from} → ${relationship.to}`, relationship.changeType)}
      <div class="endpoint-pair">
        <button data-jump-node="${escapeHtml(relationship.from)}"><span>From</span>${escapeHtml(relationship.from)}</button>
        <span class="endpoint-arrow">→</span>
        <button data-jump-node="${escapeHtml(relationship.to)}"><span>To</span>${escapeHtml(relationship.to)}</button>
      </div>
      ${section("Data", `<p class="entry-copy">${escapeHtml(relationship.data)}</p>`)}
      ${section("Purpose", `<p class="entry-copy">${escapeHtml(relationship.purpose)}</p>`)}`;
  }
}

function renderLegend(): string {
  return `<div class="legend">${(["system-input", "system-output", "system-state", "static-data", "data-processing"] as NodeTypeKey[])
    .map((type) => `<span><i style="background:${NODE_TYPES[type].color}"></i>${NODE_TYPES[type].shortLabel}</span>`)
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
