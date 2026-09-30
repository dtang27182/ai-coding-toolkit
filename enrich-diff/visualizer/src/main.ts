import { mountEnrichedPatchViewer } from "../../../common/enriched-patch/viewer/src/viewer.ts";
import { mountSystemDataflowViewer } from "../../../common/sys-dataflow/visualizer/src/viewer.ts";
import { richDiffReferences } from "./rich-diff.ts";
import "./styles.css";

type View = "dataflow" | "implementation" | "diff";

const app = document.querySelector<HTMLDivElement>("#app")!;

app.innerHTML = `
  <div class="visualizer-shell">
    <header class="review-header">
      <div class="review-title-block">
        <div class="review-title-line">
          <span class="review-title">Enriched Diff</span>
          <span class="stage-chip">code-review</span>
        </div>
        <span class="review-path">Configured output directory</span>
      </div>
      <nav class="view-navigation" aria-label="Switch view">
        <button class="view-button active" type="button" data-view="dataflow" aria-selected="true" aria-current="page">
          <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.4" aria-hidden="true"><rect x="1.5" y="2" width="5" height="4" rx="1"></rect><rect x="9.5" y="2" width="5" height="4" rx="1"></rect><rect x="5.5" y="10" width="5" height="4" rx="1"></rect><path d="M4 6v1.5a1 1 0 0 0 1 1h6a1 1 0 0 0 1-1V6M8 8.5V10"></path></svg>
          <span>System Dataflow</span>
          <span class="view-count" data-count="dataflow">nodes</span>
        </button>
        <button class="view-button" type="button" data-view="implementation" aria-selected="false">
          <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.4" aria-hidden="true"><rect x="2" y="1.5" width="12" height="13" rx="1.5"></rect><path d="M2 5.5h12M4.5 8.5h7M4.5 11.5h5"></path></svg>
          <span>Implementation Dataflow</span>
          <span class="view-count" data-count="implementation">units</span>
        </button>
        <button class="view-button" type="button" data-view="diff" aria-selected="false">
          <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.4" aria-hidden="true"><path d="M3 1.5h6l4 4v9H3z"></path><path d="M6 7.5h4M8 5.5v4M6 12h4"></path></svg>
          <span>Code diff</span>
          <span class="view-count" data-count="diff">files</span>
        </button>
      </nav>
      <div class="header-spacer"></div>
      <div class="header-actions">
        <div class="dataflow-controls" data-toolbar="dataflow">
          <span class="interaction-hint">Wheel to zoom · right-drag to pan</span>
          <button class="control-button" type="button" data-proxy="toggle-unchanged">Hide unchanged</button>
          <div class="zoom-controls">
            <button class="zoom-button" type="button" data-proxy="zoom-out" aria-label="Zoom out">−</button>
            <button class="zoom-button" type="button" data-proxy="fit">Fit</button>
            <button class="zoom-button" type="button" data-proxy="zoom-in" aria-label="Zoom in">+</button>
          </div>
        </div>
        <div class="dataflow-controls" data-toolbar="implementation" hidden>
          <span class="interaction-hint">Wheel to zoom · right-drag to pan</span>
          <button class="control-button" type="button" data-proxy="toggle-unchanged">Hide unchanged</button>
          <button class="control-button" type="button" data-proxy="toggle-functions">Hide functions</button>
          <div class="zoom-controls">
            <button class="zoom-button" type="button" data-proxy="zoom-out" aria-label="Zoom out">−</button>
            <button class="zoom-button" type="button" data-proxy="fit">Fit</button>
            <button class="zoom-button" type="button" data-proxy="zoom-in" aria-label="Zoom in">+</button>
          </div>
        </div>
        <div class="diff-legend" data-toolbar="diff" hidden aria-label="Change types">
          <span><i class="added-dot"></i>Added</span>
          <span><i class="modified-dot"></i>Modified</span>
          <span><i class="deleted-dot"></i>Deleted</span>
        </div>
        <button class="open-button" type="button" id="open-rich-diff">Open Rich Diff</button>
        <input id="rich-diff-input" type="file" accept="application/json,.json" hidden />
      </div>
    </header>
    <main class="view-panels">
      <section class="view-panel active" data-panel="dataflow" aria-label="System Dataflow"></section>
      <section class="view-panel" data-panel="implementation" aria-label="Implementation Dataflow" aria-hidden="true" inert>
        <iframe src="./implementation.html?embedded" title="Implementation Dataflow"></iframe>
      </section>
      <section class="view-panel" data-panel="diff" aria-label="Enriched Patch" aria-hidden="true"></section>
    </main>
  </div>`;

const dataflowPanel = app.querySelector<HTMLElement>('[data-panel="dataflow"]')!;
const diffPanel = app.querySelector<HTMLElement>('[data-panel="diff"]')!;
const implementationFrame = app.querySelector<HTMLIFrameElement>('[data-panel="implementation"] iframe')!;
dataflowPanel.classList.add("embedded-view");
diffPanel.classList.add("embedded-view");
const dataflowViewer = mountSystemDataflowViewer(dataflowPanel, { loadDefault: false });
const diffViewer = mountEnrichedPatchViewer(diffPanel, { loadDefault: false, hideTagsByDefault: true });

let manifestName: string | undefined;
let manifestError: string | undefined;
let implementationFile: { value: unknown; name: string } | undefined;

implementationFrame.addEventListener("load", () => {
  if (implementationFile !== undefined) {
    implementationFrame.contentWindow!.postMessage({ type: "load-impl-dataflow", ...implementationFile }, location.origin);
  }
  const root = implementationFrame.contentDocument?.querySelector("#app");
  if (root !== null && root !== undefined) {
    new MutationObserver(syncHeader).observe(root, { childList: true, subtree: true, characterData: true, attributes: true });
  }
  syncHeader();
});

function sourceControl(action: string): HTMLElement | null {
  if (app.querySelector<HTMLElement>('[data-panel="implementation"]')!.classList.contains("active")) {
    return implementationFrame.contentDocument?.querySelector<HTMLElement>(`[data-${action}]`) ?? null;
  } else if (action === "toggle-unchanged") {
    return dataflowPanel.shadowRoot!.querySelector<HTMLElement>("[data-toggle-unchanged]");
  } else if (action === "zoom-out") {
    return dataflowPanel.shadowRoot!.querySelector<HTMLElement>("[data-zoom-out]");
  } else if (action === "fit") {
    return dataflowPanel.shadowRoot!.querySelector<HTMLElement>("[data-fit]");
  } else if (action === "zoom-in") {
    return dataflowPanel.shadowRoot!.querySelector<HTMLElement>("[data-zoom-in]");
  }
  return null;
}

function syncHeader(): void {
  const dataflowRoot = dataflowPanel.shadowRoot!;
  const diffRoot = diffPanel.shadowRoot!;
  const featureName = dataflowRoot.querySelector<HTMLElement>(".feature-name")?.textContent;
  const stage = dataflowRoot.querySelector<HTMLElement>(".stage-chip")?.textContent;
  const nodeCount = dataflowRoot.querySelector<HTMLElement>(".overview-counts strong")?.textContent;
  const fileCount = diffRoot.querySelector<HTMLElement>(".file-count")?.textContent;
  const classCount = implementationFrame.contentDocument?.querySelectorAll(".class-tab").length;

  if (featureName !== undefined) app.querySelector<HTMLElement>(".review-title")!.textContent = featureName;
  if (stage !== undefined) app.querySelector<HTMLElement>(".stage-chip")!.textContent = stage;
  const pathLabel = app.querySelector<HTMLElement>(".review-path")!;
  pathLabel.textContent = manifestError ?? manifestName ?? "Open a rich-diff.json to load all three views";
  pathLabel.classList.toggle("error", manifestError !== undefined);
  if (nodeCount !== undefined) app.querySelector<HTMLElement>('[data-count="dataflow"]')!.textContent = `${nodeCount} nodes`;
  if (fileCount !== undefined) app.querySelector<HTMLElement>('[data-count="diff"]')!.textContent = `${fileCount} files`;
  if (classCount !== undefined) app.querySelector<HTMLElement>('[data-count="implementation"]')!.textContent = `${classCount} units`;

  for (const proxy of app.querySelectorAll<HTMLButtonElement>("[data-proxy]")) {
    const source = sourceControl(proxy.dataset.proxy!);
    if (source !== null && proxy.dataset.proxy !== "zoom-out" && proxy.dataset.proxy !== "zoom-in") {
      proxy.textContent = source.textContent;
      proxy.classList.toggle("active", source.classList.contains("active"));
      if (source.getAttribute("aria-pressed") !== null) proxy.setAttribute("aria-pressed", source.getAttribute("aria-pressed")!);
    }
    proxy.hidden = source === null;
  }
}

async function fetchReference(reference: string): Promise<unknown> {
  const response = await fetch(`/__rich-diff/reference?path=${encodeURIComponent(reference)}`);
  if (!response.ok) throw new Error(`Could not load ${reference}: HTTP ${response.status}`);
  return response.json();
}

async function openRichDiff(value: unknown, name: string): Promise<void> {
  try {
    const references = richDiffReferences(value);
    const [enrichedPatch, sysDataflow, implDataflow] = await Promise.all([
      fetchReference(references.enrichedPatch),
      fetchReference(references.sysDataflow),
      fetchReference(references.implDataflow),
    ]);
    diffViewer.loadEnrichedPatch(enrichedPatch, references.enrichedPatch);
    dataflowViewer.loadDataflow(sysDataflow, references.sysDataflow);
    implementationFile = { value: implDataflow, name: references.implDataflow };
    implementationFrame.contentWindow?.postMessage({ type: "load-impl-dataflow", ...implementationFile }, location.origin);
    manifestName = name;
    manifestError = undefined;
  } catch (error) {
    manifestError = `Could not open Rich Diff: ${error instanceof Error ? error.message : String(error)}`;
  }
  syncHeader();
}

async function openRichDiffFile(file: File): Promise<void> {
  try {
    await openRichDiff(JSON.parse(await file.text()), file.name);
  } catch (error) {
    manifestError = `Could not open ${file.name}: ${error instanceof Error ? error.message : String(error)}`;
    syncHeader();
  }
}

async function loadDefaultRichDiff(): Promise<void> {
  try {
    const response = await fetch("/__rich-diff/default");
    if (response.status !== 204 && response.status !== 404) {
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      } else {
        const result = await response.json() as { fileName: string; contents: string };
        await openRichDiff(JSON.parse(result.contents), result.fileName);
      }
    }
  } catch (error) {
    manifestError = `Could not open Rich Diff: ${error instanceof Error ? error.message : String(error)}`;
    syncHeader();
  }
}

function selectView(view: View): void {
  for (const button of app.querySelectorAll<HTMLButtonElement>("[data-view]")) {
    const selected = button.dataset.view === view;
    button.classList.toggle("active", selected);
    button.setAttribute("aria-selected", String(selected));
    if (selected) {
      button.setAttribute("aria-current", "page");
    } else {
      button.removeAttribute("aria-current");
    }
  }
  for (const panel of app.querySelectorAll<HTMLElement>("[data-panel]")) {
    const selected = panel.dataset.panel === view;
    panel.classList.toggle("active", selected);
    panel.setAttribute("aria-hidden", String(!selected));
    panel.inert = !selected;
  }
  for (const toolbar of app.querySelectorAll<HTMLElement>("[data-toolbar]")) {
    toolbar.hidden = toolbar.dataset.toolbar !== view;
  }
  syncHeader();
}

for (const button of app.querySelectorAll<HTMLButtonElement>("[data-view]")) {
  button.addEventListener("click", () => selectView(button.dataset.view as View));
}

for (const proxy of app.querySelectorAll<HTMLButtonElement>("[data-proxy]")) {
  proxy.addEventListener("click", () => {
    sourceControl(proxy.dataset.proxy!)?.click();
    requestAnimationFrame(syncHeader);
  });
}

app.querySelector<HTMLButtonElement>("#open-rich-diff")!.addEventListener("click", () => {
  const input = app.querySelector<HTMLInputElement>("#rich-diff-input")!;
  input.value = "";
  input.click();
});
app.querySelector<HTMLInputElement>("#rich-diff-input")!.addEventListener("change", (event) => {
  const file = (event.currentTarget as HTMLInputElement).files?.[0];
  if (file !== undefined) void openRichDiffFile(file);
});
for (const eventName of ["dragenter", "dragover"]) {
  app.addEventListener(eventName, (event) => {
    event.preventDefault();
    event.stopPropagation();
  }, true);
}
app.addEventListener("drop", (event) => {
  event.preventDefault();
  event.stopPropagation();
  const file = event.dataTransfer?.files[0];
  if (file !== undefined) void openRichDiffFile(file);
}, true);

new MutationObserver(syncHeader).observe(dataflowPanel.shadowRoot!, { childList: true, subtree: true, characterData: true, attributes: true });
new MutationObserver(syncHeader).observe(diffPanel.shadowRoot!, { childList: true, subtree: true, characterData: true, attributes: true });
syncHeader();
void loadDefaultRichDiff();
