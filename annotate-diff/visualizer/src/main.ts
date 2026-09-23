import { mountDiffViewer } from "../../../common/diff-viewer/viewer/src/viewer.ts";
import { mountSystemDataflowViewer } from "../../../common/system-dataflow/visualizer/src/viewer.ts";
import "./styles.css";

type View = "dataflow" | "diff";

const app = document.querySelector<HTMLDivElement>("#app")!;

app.innerHTML = `
  <div class="visualizer-shell">
    <header class="review-header">
      <div class="review-title-block">
        <div class="review-title-line">
          <span class="review-title">Annotated Diff</span>
          <span class="stage-chip">code-review</span>
        </div>
        <span class="review-path">Configured output directory</span>
      </div>
      <nav class="view-navigation" aria-label="Switch view">
        <button class="view-button active" type="button" data-view="dataflow" aria-selected="true" aria-current="page">
          <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.4" aria-hidden="true"><rect x="1.5" y="2" width="5" height="4" rx="1"></rect><rect x="9.5" y="2" width="5" height="4" rx="1"></rect><rect x="5.5" y="10" width="5" height="4" rx="1"></rect><path d="M4 6v1.5a1 1 0 0 0 1 1h6a1 1 0 0 0 1-1V6M8 8.5V10"></path></svg>
          <span>Dataflow</span>
          <span class="view-count" data-count="dataflow">nodes</span>
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
        <div class="diff-legend" data-toolbar="diff" hidden aria-label="Change types">
          <span><i class="added-dot"></i>Added</span>
          <span><i class="modified-dot"></i>Modified</span>
          <span><i class="deleted-dot"></i>Deleted</span>
        </div>
        <button class="open-button" type="button" data-proxy="open">Open JSON</button>
      </div>
    </header>
    <main class="view-panels">
      <section class="view-panel active" data-panel="dataflow" aria-label="System Dataflow"></section>
      <section class="view-panel" data-panel="diff" aria-label="Annotated Diff Patch" aria-hidden="true"></section>
    </main>
  </div>`;

const dataflowPanel = app.querySelector<HTMLElement>('[data-panel="dataflow"]')!;
const diffPanel = app.querySelector<HTMLElement>('[data-panel="diff"]')!;
dataflowPanel.classList.add("embedded-view");
diffPanel.classList.add("embedded-view");
mountSystemDataflowViewer(dataflowPanel);
mountDiffViewer(diffPanel);

let activeView: View = "dataflow";

function sourceControl(action: string): HTMLElement | null {
  if (action === "open" && activeView === "dataflow") {
    return dataflowPanel.shadowRoot!.querySelector<HTMLElement>("[data-open]");
  } else if (action === "open" && activeView === "diff") {
    return diffPanel.shadowRoot!.querySelector<HTMLElement>("#open-file");
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
  const fileName = dataflowRoot.querySelector<HTMLElement>(".file-label")?.textContent;
  const nodeCount = dataflowRoot.querySelector<HTMLElement>(".overview-counts strong")?.textContent;
  const fileCount = diffRoot.querySelector<HTMLElement>(".file-count")?.textContent;

  if (featureName !== undefined) app.querySelector<HTMLElement>(".review-title")!.textContent = featureName;
  if (stage !== undefined) app.querySelector<HTMLElement>(".stage-chip")!.textContent = stage;
  if (fileName !== undefined) {
    const separator = fileName.lastIndexOf("/");
    app.querySelector<HTMLElement>(".review-path")!.textContent = separator === -1 ? fileName : fileName.slice(0, separator + 1);
  }
  if (nodeCount !== undefined) app.querySelector<HTMLElement>('[data-count="dataflow"]')!.textContent = `${nodeCount} nodes`;
  if (fileCount !== undefined) app.querySelector<HTMLElement>('[data-count="diff"]')!.textContent = `${fileCount} files`;

  for (const proxy of app.querySelectorAll<HTMLButtonElement>("[data-proxy]")) {
    const source = sourceControl(proxy.dataset.proxy!);
    if (proxy.dataset.proxy === "open") {
      proxy.textContent = activeView === "dataflow" ? "Open JSON" : "Open Diff Index";
    } else if (source !== null && proxy.dataset.proxy !== "zoom-out" && proxy.dataset.proxy !== "zoom-in") {
      proxy.textContent = source.textContent;
      proxy.classList.toggle("active", source.classList.contains("active"));
      if (source.getAttribute("aria-pressed") !== null) proxy.setAttribute("aria-pressed", source.getAttribute("aria-pressed")!);
    }
    proxy.hidden = source === null;
  }
}

function selectView(view: View): void {
  activeView = view;
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

new MutationObserver(syncHeader).observe(dataflowPanel.shadowRoot!, { childList: true, subtree: true, characterData: true, attributes: true });
new MutationObserver(syncHeader).observe(diffPanel.shadowRoot!, { childList: true, subtree: true, characterData: true, attributes: true });
syncHeader();
