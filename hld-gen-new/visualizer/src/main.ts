import "./styles.css";
import { hldManifestReferences } from "./hld-manifest.ts";
import { droppedJsonFile, pickJsonFile, supportsJsonFileHandles, watchOpenedJson, type JsonFileHandle } from "../../../common/watch-opened-json.ts";

type View = "system" | "implementation";

const app = document.querySelector<HTMLDivElement>("#app")!;
let activeView: View = "system";
let manifestName: string | undefined;
let manifestError: string | undefined;
let manifestValue: unknown;
let systemFile: { value: unknown; name: string } | undefined;
let implementationFile: { value: unknown; name: string } | undefined;
let openedRepositoryFiles: string[] = [];
let stopWatchingManifest: (() => void) | undefined;

function viewerRoot(view: View): Document | ShadowRoot | null {
  const document = app.querySelector<HTMLIFrameElement>(`[data-panel="${view}"] iframe`)!.contentDocument;
  if (view === "system") {
    return document?.querySelector("#app")?.shadowRoot ?? null;
  } else {
    return document;
  }
}

function sourceControl(action: string): HTMLElement | null {
  return viewerRoot(activeView)?.querySelector<HTMLElement>(`[data-${action}]`) ?? null;
}

function syncHeader(): void {
  const systemRoot = viewerRoot("system");
  const implementationRoot = viewerRoot("implementation");
  const stage = systemRoot?.querySelector<HTMLElement>(".stage-chip")?.textContent;
  const featureName = systemRoot?.querySelector<HTMLElement>(".feature-name")?.textContent;
  const nodeCount = systemRoot?.querySelector<HTMLElement>(".overview-counts strong")?.textContent;
  const classCount = implementationRoot?.querySelectorAll(".class-tab").length;

  if (featureName !== undefined) app.querySelector<HTMLElement>(".review-title")!.textContent = featureName;
  if (stage !== undefined) {
    const chip = app.querySelector<HTMLElement>(".stage-chip")!;
    chip.textContent = stage;
    chip.hidden = false;
  }
  const pathLabel = app.querySelector<HTMLElement>(".review-path")!;
  pathLabel.textContent = manifestError ?? manifestName ?? "Open an HLD manifest to load both dataflows";
  pathLabel.classList.toggle("error", manifestError !== undefined);
  if (nodeCount !== undefined) app.querySelector<HTMLElement>('[data-count="system"]')!.textContent = `${nodeCount} nodes`;
  if (classCount !== undefined) app.querySelector<HTMLElement>('[data-count="implementation"]')!.textContent = `${classCount} units`;

  for (const proxy of app.querySelectorAll<HTMLButtonElement>("[data-proxy]")) {
    const source = sourceControl(proxy.dataset.proxy!);
    proxy.hidden = source === null;
    if (source !== null && proxy.dataset.proxy !== "zoom-out" && proxy.dataset.proxy !== "zoom-in") {
      proxy.textContent = source.textContent;
      proxy.classList.toggle("active", source.classList.contains("active"));
      if (source.getAttribute("aria-pressed") !== null) {
        proxy.setAttribute("aria-pressed", source.getAttribute("aria-pressed")!);
      } else {
        proxy.removeAttribute("aria-pressed");
      }
    }
  }
}

async function fetchReference(reference: string): Promise<{ fileName: string; contents: string }> {
  const response = await fetch(`/__hld-manifest/reference?path=${encodeURIComponent(reference)}`);
  if (!response.ok) throw new Error(`Could not load ${reference}: HTTP ${response.status}`);
  return response.json();
}

async function openManifest(value: unknown, name: string, repositoryFile = false): Promise<void> {
  try {
    const references = hldManifestReferences(value);
    const [system, implementation] = await Promise.all([
      fetchReference(references.sysDataflow),
      fetchReference(references.implDataflow),
    ]);
    systemFile = { value: JSON.parse(system.contents), name: system.fileName };
    implementationFile = { value: JSON.parse(implementation.contents), name: implementation.fileName };
    app.querySelector<HTMLIFrameElement>('[data-panel="system"] iframe')!.contentWindow?.postMessage({ type: "load-sys-dataflow", ...systemFile }, location.origin);
    app.querySelector<HTMLIFrameElement>('[data-panel="implementation"] iframe')!.contentWindow?.postMessage({ type: "load-impl-dataflow", ...implementationFile }, location.origin);
    manifestName = name;
    manifestValue = value;
    manifestError = undefined;
    openedRepositoryFiles = repositoryFile ? [name, system.fileName, implementation.fileName] : [];
  } catch (error) {
    manifestError = `Could not open HLD manifest: ${error instanceof Error ? error.message : String(error)}`;
  }
  syncHeader();
}

async function openManifestFile(file: File, handle?: JsonFileHandle, contents?: string): Promise<void> {
  try {
    const fileContents = contents ?? await file.text();
    await openManifest(JSON.parse(fileContents), file.name);
    if (manifestError === undefined) {
      stopWatchingManifest?.();
      stopWatchingManifest = handle === undefined ? undefined : watchOpenedJson(
        handle,
        fileContents,
        (changedFile, changedContents) => openManifestFile(changedFile, handle, changedContents),
        (error) => {
          manifestError = `Could not refresh ${file.name}: ${error instanceof Error ? error.message : String(error)}`;
          syncHeader();
        },
      );
    }
  } catch (error) {
    manifestError = `Could not open ${file.name}: ${error instanceof Error ? error.message : String(error)}`;
    syncHeader();
  }
}

async function loadDefaultManifest(): Promise<void> {
  try {
    const response = await fetch("/__hld-manifest/default");
    if (response.status !== 204 && response.status !== 404) {
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const result = await response.json() as { fileName: string; contents: string };
      await openManifest(JSON.parse(result.contents), result.fileName, true);
    }
  } catch (error) {
    manifestError = `Could not open HLD manifest: ${error instanceof Error ? error.message : String(error)}`;
    syncHeader();
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
    panel.inert = !selected;
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

app.querySelector<HTMLButtonElement>("#open-hld-manifest")!.addEventListener("click", () => {
  if (supportsJsonFileHandles()) {
    void pickJsonFile().then((opened) => {
      if (opened !== undefined) return openManifestFile(opened.file, opened.handle);
    });
  } else {
    const input = app.querySelector<HTMLInputElement>("#hld-manifest-input")!;
    input.value = "";
    input.click();
  }
});
app.querySelector<HTMLInputElement>("#hld-manifest-input")!.addEventListener("change", (event) => {
  const file = (event.currentTarget as HTMLInputElement).files?.[0];
  if (file !== undefined) void openManifestFile(file);
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
  void droppedJsonFile(event).then((opened) => {
    if (opened !== undefined) return openManifestFile(opened.file, opened.handle);
  });
}, true);

import.meta.hot?.on("hld-dataflow:file-change", (update: { fileName: string; contents: string }) => {
  if (openedRepositoryFiles.includes(update.fileName)) {
    if (update.fileName === manifestName) {
      try {
        void openManifest(JSON.parse(update.contents), manifestName, true);
      } catch (error) {
        manifestError = `Could not refresh ${manifestName}: ${error instanceof Error ? error.message : String(error)}`;
        syncHeader();
      }
    } else {
      void openManifest(manifestValue, manifestName!, true);
    }
  }
});

for (const iframe of app.querySelectorAll<HTMLIFrameElement>("iframe")) {
  iframe.addEventListener("load", () => {
    const view = iframe.parentElement!.dataset.panel as View;
    const file = view === "system" ? systemFile : implementationFile;
    if (file !== undefined) iframe.contentWindow?.postMessage({ type: view === "system" ? "load-sys-dataflow" : "load-impl-dataflow", ...file }, location.origin);
    const root = viewerRoot(view)!;
    new MutationObserver(syncHeader).observe(root, { childList: true, subtree: true, characterData: true, attributes: true });
    syncHeader();
  });
}

syncHeader();
void loadDefaultManifest();
