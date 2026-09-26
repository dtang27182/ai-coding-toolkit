import "./styles.css";

type View = "system" | "implementation";

const app = document.querySelector<HTMLDivElement>("#app")!;
let activeView: View = "system";

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
  const fileName = systemRoot?.querySelector<HTMLElement>(".file-label")?.textContent;
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
  if (fileName !== undefined) {
    const separator = fileName.lastIndexOf("/");
    app.querySelector<HTMLElement>(".review-path")!.textContent = separator === -1 ? fileName : fileName.slice(0, separator + 1);
  }
  if (nodeCount !== undefined) app.querySelector<HTMLElement>('[data-count="system"]')!.textContent = `${nodeCount} nodes`;
  if (classCount !== undefined) app.querySelector<HTMLElement>('[data-count="implementation"]')!.textContent = `${classCount} classes`;

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

for (const iframe of app.querySelectorAll<HTMLIFrameElement>("iframe")) {
  iframe.addEventListener("load", () => {
    const view = iframe.parentElement!.dataset.panel as View;
    const root = viewerRoot(view)!;
    new MutationObserver(syncHeader).observe(root, { childList: true, subtree: true, characterData: true, attributes: true });
    syncHeader();
  });
}
