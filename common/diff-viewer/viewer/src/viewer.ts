import Ajv2020, { type ErrorObject } from "ajv/dist/2020.js";
import diffIndexSchema from "../../diff-index.schema.json";
import { changeBlocks, changeRuns } from "./change-navigation.ts";
import { exampleIndex } from "./example.ts";
import { clampSidebarWidth, MAX_SIDEBAR_WIDTH, MIN_SIDEBAR_WIDTH } from "./layout.ts";
import { buildTree, expandedNodeIds, expansionStates, semanticError, statsForElement, unmatchedCount, type TreeNode } from "./model.ts";
import { firstChangedLine, parsePatch } from "./patch.ts";
import { isLineWrapShortcut } from "./shortcuts.ts";
import styles from "./styles.css?inline";
import type { DiffElement, DiffFile, DiffIndex } from "./types.ts";

export function mountDiffViewer(host: HTMLElement, options: { loadDefault?: boolean; expansionStorageKey?: string } = {}): {
  loadIndex(value: unknown, name: string, preserveView?: boolean): void;
} {
  const root = host.shadowRoot ?? host.attachShadow({ mode: "open" });
  root.innerHTML = `<style>${styles}</style><div id="app"></div>`;
  const app = root.querySelector<HTMLDivElement>("#app")!;
  const ajv = new Ajv2020({ allErrors: true });
  const validate = ajv.compile<DiffIndex>(diffIndexSchema);
  const ICONS: Record<"directory" | DiffElement["kind"], string> = {
    directory: '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M1.5 3.5h5l1.4 1.6h6.6v7.4h-13z"/></svg>',
    file: '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M3 1.5h6l4 4v9H3z"/><path d="M9 1.5v4h4"/></svg>',
    class: '<svg viewBox="0 0 16 16" aria-hidden="true"><rect x="2" y="2" width="12" height="12" rx="2"/><path d="M10.5 5.5a3.5 3.5 0 1 0 0 5"/></svg>',
    method: '<svg viewBox="0 0 16 16" aria-hidden="true"><circle cx="8" cy="8" r="6"/><path d="M5.5 10.5v-5L8 8l2.5-2.5v5"/></svg>',
  };

  let index = exampleIndex;
  let files = parsePatch(index.patch);
  let fileName = "bundled-example.diff-index.json";
  let selectedId = initialSelection(index);
  let expandedIds = expandedNodeIds(buildTree(index));
  let hasLoadedIndex = false;
  let statusMessage = "";
  let dragDepth = 0;
  let wrapLines = false;
  let sidebarWidth = 330;

  function escapeHtml(value: string | number): string {
    return String(value)
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  function basename(path: string): string {
    return path.slice(path.lastIndexOf("/") + 1);
  }

  function initialSelection(value: DiffIndex, useHash = true): string {
    const hashId = useHash ? decodeURIComponent(location.hash.slice(1)) : "";
    let selection;
    if (value.elements[hashId] !== undefined) {
      selection = hashId;
    } else {
      const entries = Object.entries(value.elements);
      selection = entries.find(([, element]) => element.kind === "method")?.[0]
        ?? entries.find(([, element]) => element.kind === "class")?.[0]
        ?? entries[0][0];
    }
    return selection;
  }

  function icon(kind: "directory" | DiffElement["kind"]): string {
    return ICONS[kind];
  }

  function renderTree(nodes: TreeNode[], depth = 0): string {
    return nodes.map((node) => {
      const open = expandedIds.has(node.id);
      const hasChildren = node.children.length > 0;
      const children = hasChildren && open ? renderTree(node.children, depth + 1) : "";
      if (node.kind === "directory") {
        return `
          <div class="tree-node">
            <button class="tree-row directory-row" type="button" data-toggle="${escapeHtml(node.id)}" style="--depth:${depth}">
              <span class="disclosure ${open ? "open" : ""}">›</span>
              <span class="node-icon directory-icon">${icon("directory")}</span>
              <span class="node-label">${escapeHtml(node.name)}</span>
            </button>
            ${children}
          </div>`;
      } else {
        const stats = statsForElement(node.element, files);
        const selected = node.id === selectedId ? " selected" : "";
        const unmapped = node.element.kind === "file" ? unmatchedCount(node.element) : 0;
        return `
          <div class="tree-node">
            <div class="tree-row element-row ${node.element.kind}-row ${stats.changeType}${selected}" style="--depth:${depth}">
              ${hasChildren
                ? `<button class="disclosure-button" type="button" data-toggle="${escapeHtml(node.id)}" aria-label="${open ? "Collapse" : "Expand"} ${escapeHtml(node.element.name)}"><span class="disclosure ${open ? "open" : ""}">›</span></button>`
                : '<span class="disclosure-spacer"></span>'}
              <button class="element-button" type="button" data-select="${escapeHtml(node.id)}">
                <span class="node-icon">${icon(node.element.kind)}</span>
                <span class="node-label">${escapeHtml(node.element.kind === "file" ? basename(node.element.name) : node.element.name)}</span>
                ${unmapped > 0 ? `<span class="unmapped" title="Changed lines not matched to a class or method">${unmapped} unmapped</span>` : ""}
                <span class="line-stats"><span class="plus">+${stats.added}</span><span class="minus">−${stats.removed}</span></span>
              </button>
            </div>
            ${children}
          </div>`;
      }
    }).join("");
  }

  function selectedFile(): DiffFile {
    const element = index.elements[selectedId];
    const path = element.kind === "file" ? element.name : element.locations[0].file;
    return files.find((file) => file.path === path)!;
  }

  function renderDiff(file: DiffFile): string {
    if (file.binary) {
      return '<div class="empty-diff"><span class="binary-mark">01</span><strong>Binary file changed</strong><span>No text lines are available in the embedded patch.</span></div>';
    } else if (file.rows.length === 0) {
      return '<div class="empty-diff"><strong>No text rows</strong><span>The patch does not contain displayable lines for this file.</span></div>';
    } else {
      const blockStarts = new Map(changeBlocks(file.rows).map((block, blockIndex) => [block.startRowIndex, blockIndex]));
      return file.rows.map((row, rowIndex) => `
        <div class="diff-row ${row.kind}" ${row.oldLine === undefined ? "" : `data-old-line="${row.oldLine}"`} ${row.newLine === undefined ? "" : `data-new-line="${row.newLine}"`} ${blockStarts.has(rowIndex) ? `data-change-block="${blockStarts.get(rowIndex)}"` : ""}>
          <span class="line-number old-number">${row.oldLine ?? ""}</span>
          <span class="line-number new-number">${row.newLine ?? ""}</span>
          <span class="marker">${row.kind === "add" ? "+" : row.kind === "delete" ? "−" : ""}</span>
          <code>${row.text === "" ? "&nbsp;" : escapeHtml(row.text)}</code>
        </div>`).join("");
    }
  }

  function renderMinimap(file: DiffFile): string {
    const rowCount = file.rows.length;
    const marks = rowCount === 0 ? "" : changeRuns(file.rows).map((run) => {
      const top = run.startRowIndex / rowCount * 100;
      const height = (run.endRowIndex - run.startRowIndex + 1) / rowCount * 100;
      return `<span class="minimap-mark ${run.kind}" style="top:${top}%;height:${height}%"></span>`;
    }).join("");
    return `
      <button class="change-minimap" id="change-minimap" type="button" title="Changes in this file" aria-label="Scroll through changes in this file">
        <span class="minimap-inner">
          ${marks}
          <span class="minimap-viewport" id="minimap-viewport"></span>
        </span>
      </button>`;
  }

  function render(): void {
    const tree = buildTree(index);
    const allExpanded = [...expandedNodeIds(tree)].every((id) => expandedIds.has(id));
    const totalAdded = files.reduce((sum, file) => sum + file.added, 0);
    const totalRemoved = files.reduce((sum, file) => sum + file.removed, 0);
    const fileElements = Object.values(index.elements).filter((element) => element.kind === "file");
    const entityCount = Object.keys(index.elements).length - fileElements.length;
    const unmapped = fileElements.reduce((sum, element) => sum + unmatchedCount(element), 0);
    const file = selectedFile();
    const blockCount = changeBlocks(file.rows).length;
    app.innerHTML = `
      <div class="app-shell">
        <header class="topbar">
          <div class="brand"><span class="brand-mark">Δ</span><span>Code Diff</span></div>
          <div class="source-name" title="${escapeHtml(fileName)}">${escapeHtml(fileName)}</div>
          <div class="legend" aria-label="Change types">
            <span><i class="added-dot"></i>Added</span>
            <span><i class="modified-dot"></i>Modified</span>
            <span><i class="deleted-dot"></i>Deleted</span>
          </div>
          <button class="open-button" type="button" id="open-file">Open Diff Index</button>
          <input type="file" id="file-input" accept="application/json,.json" hidden>
        </header>
        ${statusMessage === "" ? "" : `<div class="status-banner">${escapeHtml(statusMessage)}</div>`}
        <div class="workspace" style="--sidebar-width:${sidebarWidth}px">
          <aside class="sidebar">
            <div class="sidebar-heading">
              <span>File structure</span>
              <div class="sidebar-actions">
                <button class="tree-toggle-button" type="button" id="toggle-tree" aria-controls="file-tree">${allExpanded ? "Collapse all" : "Expand all"}</button>
                <span class="file-count">${fileElements.length}</span>
              </div>
            </div>
            <section class="summary-card">
              <div><strong>${totalAdded + totalRemoved}</strong><span>changed lines</span></div>
              <p>${fileElements.length} ${fileElements.length === 1 ? "file" : "files"} · ${entityCount} ${entityCount === 1 ? "entity" : "entities"}</p>
              <div class="summary-counts"><span class="plus">+${totalAdded}</span><span class="minus">−${totalRemoved}</span>${unmapped > 0 ? `<span>${unmapped} unmapped</span>` : ""}</div>
            </section>
            <nav class="file-tree" id="file-tree" aria-label="Changed files and code entities">${renderTree(tree)}</nav>
          </aside>
          <div class="sidebar-resizer" id="sidebar-resizer" role="separator" aria-label="Resize file navigation" aria-orientation="vertical" aria-valuemin="${MIN_SIDEBAR_WIDTH}" aria-valuemax="${MAX_SIDEBAR_WIDTH}" aria-valuenow="${sidebarWidth}" tabindex="0"></div>
          <main class="file-panel">
            <div class="file-bar">
              <span class="file-icon">${icon("file")}</span>
              <span class="file-path">${escapeHtml(file.path)}</span>
              <span class="file-stats"><span class="plus">+${file.added}</span><span class="minus">−${file.removed}</span></span>
              <div class="change-navigation" aria-label="Change navigation">
                ${blockCount === 0
                  ? '<span class="change-counter">No changes</span>'
                  : `<span class="change-counter" aria-live="polite">Change <strong id="current-change">–</strong> of <strong>${blockCount}</strong></span>`}
                <button class="change-button" id="previous-change" type="button" title="Previous change">↑ Prev</button>
                <button class="change-button" id="next-change" type="button" title="Next change">↓ Next</button>
              </div>
              <button class="wrap-button ${wrapLines ? "active" : ""}" type="button" id="toggle-wrap" aria-pressed="${wrapLines}" title="Wrap long lines (Alt/Option+Z)">Wrap <kbd>⌥/Alt Z</kbd></button>
            </div>
            <div class="diff-area">
              <div class="diff-scroll ${wrapLines ? "wrap-lines" : ""}" id="diff-scroll">
                <div class="diff-content" id="diff-content">${renderDiff(file)}</div>
                <div class="scroll-end-spacer" id="scroll-end-spacer" aria-hidden="true"></div>
              </div>
              ${renderMinimap(file)}
            </div>
          </main>
        </div>
        <div class="drop-overlay"><div><strong>Open diff-index.json</strong><span>Drop the file anywhere</span></div></div>
      </div>`;

    app.querySelector<HTMLButtonElement>("#open-file")!.addEventListener("click", () => {
      const input = app.querySelector<HTMLInputElement>("#file-input")!;
      input.value = "";
      input.click();
    });
    app.querySelector<HTMLInputElement>("#file-input")!.addEventListener("change", (event) => {
      const input = event.currentTarget as HTMLInputElement;
      if (input.files?.[0] !== undefined) {
        void openFile(input.files[0]);
      }
    });
    app.querySelector<HTMLButtonElement>("#toggle-wrap")!.addEventListener("click", toggleLineWrapping);
    app.querySelector<HTMLButtonElement>("#toggle-tree")!.addEventListener("click", () => setAllNodesExpanded(!allExpanded));
    for (const button of app.querySelectorAll<HTMLElement>("[data-toggle]")) {
      button.addEventListener("click", () => toggleNode(button.dataset.toggle!));
    }
    for (const button of app.querySelectorAll<HTMLButtonElement>("[data-select]")) {
      button.addEventListener("click", () => selectElement(button.dataset.select!));
    }
    bindSidebarResizer();
    bindChangeNavigation();
  }

  function changeBlockTops(): number[] {
    return [...app.querySelectorAll<HTMLElement>("[data-change-block]")].map((element) => element.offsetTop);
  }

  function fitScrollEndSpacer(): void {
    const scroll = app.querySelector<HTMLElement>("#diff-scroll")!;
    app.querySelector<HTMLElement>("#scroll-end-spacer")!.style.height = `${Math.max(0, scroll.clientHeight - 80)}px`;
  }

  function paintMinimapViewport(): void {
    const scroll = app.querySelector<HTMLElement>("#diff-scroll")!;
    const content = app.querySelector<HTMLElement>("#diff-content")!;
    const viewport = app.querySelector<HTMLElement>("#minimap-viewport")!;
    const contentHeight = content.offsetHeight;
    let top = 0;
    let size = 1;
    if (contentHeight > 0) {
      size = Math.min(1, scroll.clientHeight / contentHeight);
      top = Math.max(0, (scroll.scrollTop - content.offsetTop) / contentHeight);
      top = Math.min(top, 1 - size);
    }
    viewport.style.top = `${top * 100}%`;
    viewport.style.height = `${size * 100}%`;
  }

  function changeTarget(direction: -1 | 1): number | undefined {
    const scroll = app.querySelector<HTMLElement>("#diff-scroll")!;
    const tops = changeBlockTops().map((top) => top - 12);
    let target;
    if (direction === 1) {
      target = tops.find((top) => top > scroll.scrollTop + 2);
    } else if (direction === -1) {
      target = [...tops].reverse().find((top) => top < scroll.scrollTop - 2);
    }
    return target;
  }

  function updateChangeNavigation(): void {
    const scroll = app.querySelector<HTMLElement>("#diff-scroll")!;
    const tops = changeBlockTops();
    const atBottom = scroll.scrollTop + scroll.clientHeight >= scroll.scrollHeight - 2;
    const reference = atBottom ? scroll.scrollTop + scroll.clientHeight - 40 : scroll.scrollTop + 16;
    let current = -1;
    tops.forEach((top, blockIndex) => {
      if (top <= reference) {
        current = blockIndex;
      }
    });
    const currentLabel = app.querySelector<HTMLElement>("#current-change");
    if (currentLabel !== null) {
      currentLabel.textContent = current < 0 ? "–" : String(current + 1);
    }
    app.querySelector<HTMLButtonElement>("#previous-change")!.disabled = changeTarget(-1) === undefined;
    app.querySelector<HTMLButtonElement>("#next-change")!.disabled = changeTarget(1) === undefined;
    paintMinimapViewport();
  }

  function stepChange(direction: -1 | 1): void {
    const target = changeTarget(direction);
    if (target !== undefined) {
      app.querySelector<HTMLElement>("#diff-scroll")!.scrollTo({ top: Math.max(0, target), behavior: "smooth" });
    }
  }

  function scrollFromMinimap(event: MouseEvent): void {
    const minimap = app.querySelector<HTMLElement>(".minimap-inner")!;
    const scroll = app.querySelector<HTMLElement>("#diff-scroll")!;
    const content = app.querySelector<HTMLElement>("#diff-content")!;
    const bounds = minimap.getBoundingClientRect();
    const fraction = Math.min(1, Math.max(0, (event.clientY - bounds.top) / bounds.height));
    const target = content.offsetTop + fraction * content.offsetHeight - scroll.clientHeight / 2;
    scroll.scrollTo({ top: Math.max(0, target), behavior: "smooth" });
  }

  function bindChangeNavigation(): void {
    const scroll = app.querySelector<HTMLElement>("#diff-scroll")!;
    fitScrollEndSpacer();
    updateChangeNavigation();
    scroll.addEventListener("scroll", updateChangeNavigation);
    app.querySelector<HTMLButtonElement>("#previous-change")!.addEventListener("click", () => stepChange(-1));
    app.querySelector<HTMLButtonElement>("#next-change")!.addEventListener("click", () => stepChange(1));
    app.querySelector<HTMLButtonElement>("#change-minimap")!.addEventListener("click", scrollFromMinimap);
  }

  function bindSidebarResizer(): void {
    const resizer = app.querySelector<HTMLElement>("#sidebar-resizer")!;
    const sidebar = app.querySelector<HTMLElement>(".sidebar")!;
    let dragging = false;
    let startX = 0;
    let startWidth = 0;

    function finishDragging(): void {
      if (dragging) {
        dragging = false;
        host.classList.remove("resizing-sidebar");
      }
    }

    resizer.addEventListener("pointerdown", (event) => {
      if (event.button === 0) {
        dragging = true;
        startX = event.clientX;
        startWidth = sidebar.getBoundingClientRect().width;
        resizer.setPointerCapture(event.pointerId);
        host.classList.add("resizing-sidebar");
        event.preventDefault();
      }
    });
    resizer.addEventListener("pointermove", (event) => {
      if (dragging) {
        setSidebarWidth(startWidth + event.clientX - startX);
      }
    });
    resizer.addEventListener("pointerup", finishDragging);
    resizer.addEventListener("pointercancel", finishDragging);
    resizer.addEventListener("keydown", (event) => {
      let requestedWidth;
      if (event.key === "ArrowLeft") {
        requestedWidth = sidebarWidth - 16;
      } else if (event.key === "ArrowRight") {
        requestedWidth = sidebarWidth + 16;
      } else if (event.key === "Home") {
        requestedWidth = MIN_SIDEBAR_WIDTH;
      } else if (event.key === "End") {
        requestedWidth = MAX_SIDEBAR_WIDTH;
      }
      if (requestedWidth !== undefined) {
        event.preventDefault();
        setSidebarWidth(requestedWidth);
      }
    });
    if (matchMedia("(min-width: 621px)").matches) {
      setSidebarWidth(sidebarWidth);
    }
  }

  function setSidebarWidth(width: number): void {
    const workspace = app.querySelector<HTMLElement>(".workspace")!;
    const resizer = app.querySelector<HTMLElement>("#sidebar-resizer")!;
    sidebarWidth = clampSidebarWidth(width, workspace.clientWidth);
    workspace.style.setProperty("--sidebar-width", `${sidebarWidth}px`);
    resizer.setAttribute("aria-valuenow", String(sidebarWidth));
  }

  function toggleLineWrapping(): void {
    wrapLines = !wrapLines;
    const scroll = app.querySelector<HTMLElement>("#diff-scroll")!;
    const button = app.querySelector<HTMLButtonElement>("#toggle-wrap")!;
    scroll.classList.toggle("wrap-lines", wrapLines);
    if (wrapLines) {
      scroll.scrollLeft = 0;
    }
    button.classList.toggle("active", wrapLines);
    button.setAttribute("aria-pressed", String(wrapLines));
    fitScrollEndSpacer();
    updateChangeNavigation();
  }

  function toggleNode(id: string): void {
    const scrollTop = app.querySelector<HTMLElement>("#diff-scroll")!.scrollTop;
    if (expandedIds.has(id)) {
      expandedIds.delete(id);
    } else {
      expandedIds.add(id);
    }
    saveExpansion();
    render();
    app.querySelector<HTMLElement>("#diff-scroll")!.scrollTop = scrollTop;
    updateChangeNavigation();
  }

  function setAllNodesExpanded(expand: boolean): void {
    const scrollTop = app.querySelector<HTMLElement>("#diff-scroll")!.scrollTop;
    expandedIds = expandedNodeIds(buildTree(index), expand);
    saveExpansion();
    render();
    app.querySelector<HTMLElement>("#diff-scroll")!.scrollTop = scrollTop;
    updateChangeNavigation();
  }

  function selectElement(id: string, updateHash = true): void {
    const navigationScrollTop = app.querySelector<HTMLElement>("#file-tree")!.scrollTop;
    selectedId = id;
    if (updateHash) {
      history.replaceState(null, "", `#${encodeURIComponent(id)}`);
    }
    render();
    app.querySelector<HTMLElement>("#file-tree")!.scrollTop = navigationScrollTop;
    requestAnimationFrame(scrollToSelection);
  }

  function scrollToSelection(): void {
    const element = index.elements[selectedId];
    const scroll = app.querySelector<HTMLElement>("#diff-scroll")!;
    let selector;
    if (element.kind === "file") {
      const target = firstChangedLine(selectedFile());
      if (target === undefined) {
        scroll.scrollTop = 0;
      } else {
        selector = `[data-${target.side}-line="${target.line}"]`;
      }
    } else {
      const location = element.locations[0];
      selector = location.newLines !== null
        ? `[data-new-line="${location.newLines[0]}"]`
        : `[data-old-line="${location.oldLines![0]}"]`;
    }
    if (selector !== undefined) {
      scroll.querySelector<HTMLElement>(selector)?.scrollIntoView({ block: "center", behavior: "smooth" });
    }
  }

  function validationMessage(errors: ErrorObject[] | null | undefined): string {
    return errors?.map((error) => `${error.instancePath || "/"} ${error.message}`).join("; ") ?? "Invalid diff index";
  }

  function saveExpansion(): void {
    if (options.expansionStorageKey !== undefined && hasLoadedIndex) {
      sessionStorage.setItem(options.expansionStorageKey, JSON.stringify([...expansionStates(buildTree(index), expandedIds)]));
    }
  }

  function loadIndex(value: unknown, name: string, preserveView = false): void {
    if (!validate(value)) {
      throw new Error(validationMessage(validate.errors));
    }
    const parsedFiles = parsePatch(value.patch);
    const semantic = semanticError(value, parsedFiles);
    if (semantic !== undefined) {
      throw new Error(semantic);
    }
    const previousElement = index.elements[selectedId];
    const previousFile = selectedFile().path;
    const previousParent = previousElement.parentId === undefined ? undefined : index.elements[previousElement.parentId]?.name;
    const previousScrollTop = app.querySelector<HTMLElement>("#diff-scroll")!.scrollTop;
    const previousScrollLeft = app.querySelector<HTMLElement>("#diff-scroll")!.scrollLeft;
    const previousExpansion = hasLoadedIndex
      ? expansionStates(buildTree(index), expandedIds)
      : new Map<string, boolean>(JSON.parse(
        options.expansionStorageKey === undefined ? "[]" : sessionStorage.getItem(options.expansionStorageKey) ?? "[]",
      ));
    index = value;
    files = parsedFiles;
    fileName = name;
    let preservedSelection = false;
    if (preserveView) {
      const match = Object.entries(index.elements).find(([, element]) =>
        element.kind === previousElement.kind &&
        element.name === previousElement.name &&
        (element.kind === "file" ? element.name : element.locations[0].file) === previousFile &&
        (element.parentId === undefined ? undefined : index.elements[element.parentId]?.name) === previousParent
      );
      const fileMatch = Object.entries(index.elements).find(([, element]) =>
        element.kind === "file" && element.name === previousFile
      );
      if (match !== undefined) {
        selectedId = match[0];
        preservedSelection = true;
      } else if (fileMatch !== undefined) {
        selectedId = fileMatch[0];
        preservedSelection = true;
      } else {
        selectedId = initialSelection(index, false);
      }
      history.replaceState(null, "", `#${encodeURIComponent(selectedId)}`);
    } else {
      selectedId = initialSelection(index);
    }
    expandedIds = expandedNodeIds(buildTree(index), true, previousExpansion);
    hasLoadedIndex = true;
    saveExpansion();
    statusMessage = "";
    render();
    if (preservedSelection) {
      requestAnimationFrame(() => {
        const scroll = app.querySelector<HTMLElement>("#diff-scroll")!;
        scroll.scrollTop = previousScrollTop;
        scroll.scrollLeft = previousScrollLeft;
        updateChangeNavigation();
      });
    } else {
      requestAnimationFrame(scrollToSelection);
    }
  }

  async function openFile(file: File): Promise<void> {
    try {
      loadIndex(JSON.parse(await file.text()), file.name);
    } catch (error) {
      statusMessage = error instanceof Error ? error.message : String(error);
      render();
    }
  }

  async function loadDefault(): Promise<void> {
    try {
      const response = await fetch("/__diff-index/default");
      if (response.ok && response.status !== 204) {
        const result = await response.json() as { fileName: string; contents: string };
        loadIndex(JSON.parse(result.contents), result.fileName);
      }
    } catch {
      // Static builds and missing development middleware use the bundled example.
    }
  }

  window.addEventListener("hashchange", () => {
    const hashId = decodeURIComponent(location.hash.slice(1));
    if (index.elements[hashId] !== undefined && hashId !== selectedId) {
      selectElement(hashId, false);
    }
  });

  window.addEventListener("keydown", (event) => {
    if (isLineWrapShortcut(event)) {
      event.preventDefault();
      toggleLineWrapping();
    }
  });

  window.addEventListener("resize", () => {
    if (matchMedia("(min-width: 621px)").matches) {
      setSidebarWidth(sidebarWidth);
    }
    fitScrollEndSpacer();
    updateChangeNavigation();
  });

  host.addEventListener("dragenter", (event) => {
    event.preventDefault();
    dragDepth += 1;
    host.classList.add("dragging");
  });
  host.addEventListener("dragover", (event) => event.preventDefault());
  host.addEventListener("dragleave", (event) => {
    event.preventDefault();
    dragDepth -= 1;
    if (dragDepth === 0) {
      host.classList.remove("dragging");
    }
  });
  host.addEventListener("drop", (event) => {
    event.preventDefault();
    dragDepth = 0;
    host.classList.remove("dragging");
    if (event.dataTransfer?.files[0] !== undefined) {
      void openFile(event.dataTransfer.files[0]);
    }
  });

  render();
  requestAnimationFrame(scrollToSelection);
  if (options.loadDefault !== false) void loadDefault();
  return { loadIndex };
}
