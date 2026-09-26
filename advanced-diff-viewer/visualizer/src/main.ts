import "../../../common/enriched-patch/viewer/src/standalone.css";
import { mountEnrichedPatchViewer } from "../../../common/enriched-patch/viewer/src/viewer.ts";
import "./styles.css";

interface EnrichedPatchResponse {
  state: "ready" | "empty" | "error";
  version: number;
  fileName?: string;
  contents?: string;
  message?: string;
}

const app = document.querySelector<HTMLElement>("#app")!;
app.innerHTML = `
  <div class="advanced-shell">
    <header class="advanced-toolbar">
      <span class="advanced-activity">
        <span class="advanced-spinner" aria-hidden="true"></span>
        <span class="advanced-status" role="status">Generating enriched patch…</span>
      </span>
      <button class="refresh-button" type="button">Refresh</button>
    </header>
    <div class="viewer-host" hidden></div>
    <div class="empty-state">Generating enriched patch…</div>
  </div>`;

const viewerHost = app.querySelector<HTMLElement>(".viewer-host")!;
const emptyState = app.querySelector<HTMLElement>(".empty-state")!;
const status = app.querySelector<HTMLElement>(".advanced-status")!;
const spinner = app.querySelector<HTMLElement>(".advanced-spinner")!;
const refreshButton = app.querySelector<HTMLButtonElement>(".refresh-button")!;
const viewer = mountEnrichedPatchViewer(viewerHost, {
  loadDefault: false,
  expansionStorageKey: "advanced-diff-viewer:expanded-tree",
});
let hasEnrichedPatch = false;
let version = 0;

function showRefreshing(): void {
  spinner.hidden = false;
  status.textContent = "Refreshing diff…";
}

function applyResponse(result: EnrichedPatchResponse): void {
  if (result.version <= version) return;
  version = result.version;
  spinner.hidden = true;
  if (result.state === "ready") {
    viewer.loadEnrichedPatch(JSON.parse(result.contents!), result.fileName!, hasEnrichedPatch);
    hasEnrichedPatch = true;
    viewerHost.hidden = false;
    emptyState.hidden = true;
    status.textContent = `Updated ${new Date().toLocaleTimeString()}`;
  } else if (result.state === "empty") {
    hasEnrichedPatch = false;
    viewerHost.hidden = true;
    emptyState.hidden = false;
    emptyState.textContent = "No changes against HEAD.";
    status.textContent = "No changes against HEAD";
  } else if (result.state === "error") {
    if (!hasEnrichedPatch && result.contents !== undefined && result.fileName !== undefined) {
      viewer.loadEnrichedPatch(JSON.parse(result.contents), result.fileName);
      hasEnrichedPatch = true;
      viewerHost.hidden = false;
      emptyState.hidden = true;
    }
    if (!hasEnrichedPatch) {
      emptyState.hidden = false;
      emptyState.textContent = "Could not generate the enriched patch.";
    }
    status.textContent = `Refresh failed: ${result.message}`;
  }
}

async function loadCurrent(refresh = false): Promise<void> {
  const showProgress = refresh || version === 0;
  if (showProgress) {
    refreshButton.disabled = true;
    if (refresh) showRefreshing();
  }
  try {
    const response = await fetch(refresh ? "/__enriched-patch/refresh" : "/__enriched-patch/default", {
      method: refresh ? "POST" : "GET",
      cache: "no-store",
    });
    if (!response.ok) throw new Error(`Server returned ${response.status}`);
    applyResponse(await response.json() as EnrichedPatchResponse);
  } catch (error) {
    spinner.hidden = true;
    status.textContent = `Refresh failed: ${error instanceof Error ? error.message : String(error)}`;
    if (!hasEnrichedPatch) {
      emptyState.hidden = false;
      emptyState.textContent = "Could not generate the enriched patch.";
    }
  } finally {
    if (showProgress) refreshButton.disabled = false;
  }
}

refreshButton.addEventListener("click", () => { void loadCurrent(true); });
import.meta.hot?.on("advanced-diff:refreshing", showRefreshing);
import.meta.hot?.on("advanced-diff:update", () => { void loadCurrent(); });
void loadCurrent();
