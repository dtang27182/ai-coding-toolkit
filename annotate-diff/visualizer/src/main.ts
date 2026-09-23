import { mountDiffViewer } from "../../../common/diff-viewer/viewer/src/viewer.ts";
import { mountSystemDataflowViewer } from "../../../common/system-dataflow/visualizer/src/viewer.ts";
import "./styles.css";

type View = "dataflow" | "diff";

const app = document.querySelector<HTMLDivElement>("#app")!;

app.innerHTML = `
  <div class="visualizer-shell">
    <nav class="view-navigation" aria-label="Visualizer views">
      <span class="product-name">Annotated Diff</span>
      <button class="view-button active" type="button" data-view="dataflow" aria-selected="true">System Dataflow</button>
      <button class="view-button" type="button" data-view="diff" aria-selected="false">Annotated Diff Patch</button>
    </nav>
    <main class="view-panels">
      <section class="view-panel active" data-panel="dataflow" aria-label="System Dataflow"></section>
      <section class="view-panel" data-panel="diff" aria-label="Annotated Diff Patch" aria-hidden="true"></section>
    </main>
  </div>`;

mountSystemDataflowViewer(app.querySelector<HTMLElement>('[data-panel="dataflow"]')!);
mountDiffViewer(app.querySelector<HTMLElement>('[data-panel="diff"]')!);

function selectView(view: View): void {
  for (const button of app.querySelectorAll<HTMLButtonElement>("[data-view]")) {
    const selected = button.dataset.view === view;
    button.classList.toggle("active", selected);
    button.setAttribute("aria-selected", String(selected));
  }
  for (const panel of app.querySelectorAll<HTMLElement>("[data-panel]")) {
    const selected = panel.dataset.panel === view;
    panel.classList.toggle("active", selected);
    panel.setAttribute("aria-hidden", String(!selected));
  }
}

for (const button of app.querySelectorAll<HTMLButtonElement>("[data-view]")) {
  button.addEventListener("click", () => selectView(button.dataset.view as View));
}
