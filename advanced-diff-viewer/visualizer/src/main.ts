import "../../../common/diff-viewer/viewer/src/standalone.css";
import { mountDiffViewer } from "../../../common/diff-viewer/viewer/src/viewer.ts";
import "./styles.css";

interface IndexResponse {
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
        <span class="advanced-status" role="status">Generating diff index…</span>
      </span>
      <button class="refresh-button" type="button">Refresh</button>
    </header>
    <div class="viewer-host" hidden></div>
    <div class="empty-state">Generating diff index…</div>
  </div>`;

const viewerHost = app.querySelector<HTMLElement>(".viewer-host")!;
const emptyState = app.querySelector<HTMLElement>(".empty-state")!;
const status = app.querySelector<HTMLElement>(".advanced-status")!;
const spinner = app.querySelector<HTMLElement>(".advanced-spinner")!;
const refreshButton = app.querySelector<HTMLButtonElement>(".refresh-button")!;
const viewer = mountDiffViewer(viewerHost, { loadDefault: false });
let hasIndex = false;
let version = 0;

function showRefreshing(): void {
  spinner.hidden = false;
  status.textContent = "Refreshing diff…";
}

function applyResponse(result: IndexResponse): void {
  if (result.version <= version) return;
  version = result.version;
  spinner.hidden = true;
  if (result.state === "ready") {
    viewer.loadIndex(JSON.parse(result.contents!), result.fileName!, hasIndex);
    hasIndex = true;
    viewerHost.hidden = false;
    emptyState.hidden = true;
    status.textContent = `Updated ${new Date().toLocaleTimeString()}`;
  } else if (result.state === "empty") {
    hasIndex = false;
    viewerHost.hidden = true;
    emptyState.hidden = false;
    emptyState.textContent = "No changes against HEAD.";
    status.textContent = "No changes against HEAD";
  } else if (result.state === "error") {
    if (!hasIndex && result.contents !== undefined && result.fileName !== undefined) {
      viewer.loadIndex(JSON.parse(result.contents), result.fileName);
      hasIndex = true;
      viewerHost.hidden = false;
      emptyState.hidden = true;
    }
    if (!hasIndex) {
      emptyState.hidden = false;
      emptyState.textContent = "Could not generate the diff index.";
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
    const response = await fetch(refresh ? "/__diff-index/refresh" : "/__diff-index/default", {
      method: refresh ? "POST" : "GET",
      cache: "no-store",
    });
    if (!response.ok) throw new Error(`Server returned ${response.status}`);
    applyResponse(await response.json() as IndexResponse);
  } catch (error) {
    spinner.hidden = true;
    status.textContent = `Refresh failed: ${error instanceof Error ? error.message : String(error)}`;
    if (!hasIndex) {
      emptyState.hidden = false;
      emptyState.textContent = "Could not generate the diff index.";
    }
  } finally {
    if (showProgress) refreshButton.disabled = false;
  }
}

refreshButton.addEventListener("click", () => { void loadCurrent(true); });
import.meta.hot?.on("advanced-diff:refreshing", showRefreshing);
import.meta.hot?.on("advanced-diff:update", () => { void loadCurrent(); });
void loadCurrent();
