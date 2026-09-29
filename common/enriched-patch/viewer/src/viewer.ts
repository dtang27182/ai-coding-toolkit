import Ajv2020, { type ErrorObject } from "ajv/dist/2020.js";
import enrichedPatchSchema from "../../enriched-patch.schema.json";
import { changeBlocks, changeRuns } from "./change-navigation.ts";
import { examplePatch } from "./example.ts";
import { clampSidebarWidth, MAX_SIDEBAR_WIDTH, MIN_SIDEBAR_WIDTH } from "./layout.ts";
import { buildTree, expandedNodeIds, expansionStates, filterTree, semanticError, statsForElement, unmatchedCount, type TreeNode } from "./model.ts";
import { firstChangedLine, parsePatch } from "./patch.ts";
import { isLineWrapShortcut } from "./shortcuts.ts";
import styles from "./styles.css?inline";
import {
  changeKey,
  collectChanges,
  elementFilterStates,
  hiddenRowsByFile,
  isChangeHidden,
  rowChanges,
  tagCounts,
  type ElementFilterState,
  type OwnedChange,
  type TagCount,
} from "./tag-filter.ts";
import type { DiffElement, DiffFile, EnrichedPatch } from "./types.ts";

export function mountEnrichedPatchViewer(host: HTMLElement, options: { loadDefault?: boolean; expansionStorageKey?: string; hideTagsByDefault?: boolean } = {}): {
  loadEnrichedPatch(value: unknown, name: string, preserveView?: boolean): void;
} {
  const root = host.shadowRoot ?? host.attachShadow({ mode: "open" });
  root.innerHTML = `<style>${styles}</style><div id="app"></div>`;
  const app = root.querySelector<HTMLDivElement>("#app")!;
  const ajv = new Ajv2020({ allErrors: true });
  const validate = ajv.compile<EnrichedPatch>(enrichedPatchSchema);
  const ICONS: Record<"directory" | DiffElement["kind"], string> = {
    directory: '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M1.5 3.5h5l1.4 1.6h6.6v7.4h-13z"/></svg>',
    file: '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M3 1.5h6l4 4v9H3z"/><path d="M9 1.5v4h4"/></svg>',
    class: '<svg viewBox="0 0 16 16" aria-hidden="true"><rect x="2" y="2" width="12" height="12" rx="2"/><path d="M10.5 5.5a3.5 3.5 0 1 0 0 5"/></svg>',
    method: '<svg viewBox="0 0 16 16" aria-hidden="true"><circle cx="8" cy="8" r="6"/><path d="M5.5 10.5v-5L8 8l2.5-2.5v5"/></svg>',
  };
  const EYE_OFF_ICON = '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M1.5 8s2.4-4.5 6.5-4.5S14.5 8 14.5 8s-2.4 4.5-6.5 4.5S1.5 8 1.5 8z"/><circle cx="8" cy="8" r="2"/><path d="M2.5 2.5l11 11"/></svg>';

  let index = examplePatch;
  let files = parsePatch(index.patch);
  let fileName = "bundled-example.enriched-patch.json";
  let selectedId = initialSelection(index);
  let expandedIds = expandedNodeIds(buildTree(index));
  let hasLoadedEnrichedPatch = false;
  let statusMessage = "";
  let dragDepth = 0;
  let wrapLines = false;
  let sidebarWidth = 560;
  let hiddenTags = new Set<string>();
  let revealedChanges = new Set<string>();
  let changes: OwnedChange[] = [];
  let tagList: TagCount[] = [];
  let filterStates = new Map<string, ElementFilterState>();
  let hiddenRows = new Map<string, boolean[]>();

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

  function initialSelection(value: EnrichedPatch, useHash = true, states?: Map<string, ElementFilterState>): string {
    const hashId = useHash ? decodeURIComponent(location.hash.slice(1)) : "";
    const entries = Object.entries(value.elements);
    const visibleEntries = states === undefined ? entries : entries.filter(([id]) => states.get(id)?.visible !== false);
    const candidates = visibleEntries.length > 0 ? visibleEntries : entries;
    let selection;
    if (value.elements[hashId] !== undefined && (states?.get(hashId)?.visible ?? true)) {
      selection = hashId;
    } else {
      selection = candidates.find(([, element]) => element.kind === "method")?.[0]
        ?? candidates.find(([, element]) => element.kind === "class")?.[0]
        ?? candidates[0][0];
    }
    return selection;
  }

  function icon(kind: "directory" | DiffElement["kind"]): string {
    return ICONS[kind];
  }

  function refreshTagFilter(applyDefaults = false): void {
    const previousTags = new Set(tagList.map(({ tag }) => tag));
    changes = collectChanges(index);
    tagList = tagCounts(changes);
    const presentTags = new Set(tagList.map(({ tag }) => tag));
    hiddenTags = applyDefaults
      ? presentTags
      : new Set([...presentTags].filter((tag) => hiddenTags.has(tag) || (options.hideTagsByDefault === true && !previousTags.has(tag))));
    filterStates = elementFilterStates(index, hiddenTags);
    hiddenRows = hiddenRowsByFile(files, changes, hiddenTags);
  }

  function tagColor(tag: string): string {
    return tagList.find((candidate) => candidate.tag === tag)?.color ?? "#8fa3b1";
  }

  function renderTagDots(tags: string[]): string {
    return tags.length === 0
      ? ""
      : `<span class="tag-dots" title="${escapeHtml(tags.join(", "))}">${tags.map((tag) => `<i style="--tag-color:${tagColor(tag)}"></i>`).join("")}</span>`;
  }

  function renderChangeTags(change: OwnedChange): string {
    return change.tags.map((tag) => `
      <span class="change-tag${hiddenTags.has(tag) ? " excluded" : ""}" style="--tag-color:${tagColor(tag)}"><i></i>${escapeHtml(tag)}</span>`).join("");
  }

  function renderTagFilter(hiddenChangeCount: number, hiddenFileCount: number, hiddenEntityCount: number): string {
    if (tagList.length === 0) {
      return "";
    } else {
      const chips = tagList.map(({ tag, count, color }) => {
        const hidden = hiddenTags.has(tag);
        return `
          <button class="tag-chip${hidden ? " hidden-tag" : ""}" type="button" data-hide-tag="${escapeHtml(tag)}" aria-pressed="${hidden}" style="--tag-color:${color}"
            title="${hidden ? `Show changes tagged ${escapeHtml(tag)}` : `Hide ${count} ${count === 1 ? "change" : "changes"} tagged ${escapeHtml(tag)}`}">
            ${hidden ? `<span class="tag-chip-icon">${EYE_OFF_ICON}</span>` : '<span class="tag-chip-dot"></span>'}
            <span class="tag-chip-name">${escapeHtml(tag)}</span>
            <span class="tag-chip-count">${count}</span>
          </button>`;
      }).join("");
      const status = hiddenTags.size === 0
        ? `All <strong>${changes.length}</strong> changes shown`
        : [
          `Hiding <strong>${hiddenChangeCount}</strong> of ${changes.length} changes`,
          hiddenFileCount === 0 ? "" : `${hiddenFileCount} ${hiddenFileCount === 1 ? "file" : "files"}`,
          hiddenEntityCount === 0 ? "" : `${hiddenEntityCount} ${hiddenEntityCount === 1 ? "entity" : "entities"}`,
        ].filter((part) => part !== "").join(" · ");
      return `
        <div class="tag-filter" role="toolbar" aria-label="Hide changes by tag">
          <span class="tag-filter-label">${EYE_OFF_ICON}Hide tags</span>
          ${chips}
          <span class="tag-filter-separator"></span>
          <span class="tag-filter-status" aria-live="polite">${status}</span>
          ${hiddenTags.size === 0 ? "" : '<button class="show-all-button" type="button" data-show-all>Show all</button>'}
        </div>`;
    }
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
        const stats = statsForElement(node.element, files, hiddenRows);
        const filterState = filterStates.get(node.id);
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
                <span class="node-details">
                  ${unmapped > 0 ? `<span class="unmapped" title="Changed lines not matched to a class or method">${unmapped} unmapped</span>` : ""}
                  ${hiddenTags.size > 0 && filterState !== undefined && filterState.hiddenChanges > 0 ? `<span class="hidden-count" title="Changes hidden by the tag filter">${filterState.hiddenChanges} hidden</span>` : ""}
                  ${renderTagDots(filterState?.visibleTags ?? [])}
                  <span class="line-stats"><span class="plus">+${stats.added}</span><span class="minus">−${stats.removed}</span></span>
                </span>
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

  interface FileFilterView {
    owners: (OwnedChange | undefined)[];
    collapsed: boolean[];
    navigableRows: DiffFile["rows"];
    hiddenChangeCount: number;
  }

  function fileFilterView(file: DiffFile): FileFilterView {
    const owners = rowChanges(file, changes);
    const collapsed = owners.map((owner) => owner !== undefined && isChangeHidden(owner, hiddenTags) && !revealedChanges.has(changeKey(owner)));
    return {
      owners,
      collapsed,
      navigableRows: file.rows.map((row, rowIndex) => collapsed[rowIndex] ? { ...row, kind: "context" as const } : row),
      hiddenChangeCount: new Set(owners.filter((owner) => owner !== undefined && isChangeHidden(owner, hiddenTags))).size,
    };
  }

  function renderDiffRow(row: DiffFile["rows"][number], blockAttribute: string): string {
    return `
        <div class="diff-row ${row.kind}" ${row.oldLine === undefined ? "" : `data-old-line="${row.oldLine}"`} ${row.newLine === undefined ? "" : `data-new-line="${row.newLine}"`} ${blockAttribute}>
          <span class="line-number old-number">${row.oldLine ?? ""}</span>
          <span class="line-number new-number">${row.newLine ?? ""}</span>
          <span class="marker">${row.kind === "add" ? "+" : row.kind === "delete" ? "−" : ""}</span>
          <code>${row.text === "" ? "&nbsp;" : escapeHtml(row.text)}</code>
        </div>`;
  }

  function renderHiddenChange(file: DiffFile, view: FileFilterView, owner: OwnedChange): string {
    const rows = file.rows.filter((_, rowIndex) => view.owners[rowIndex] === owner);
    const added = rows.filter((row) => row.kind === "add").length;
    const removed = rows.filter((row) => row.kind === "delete").length;
    return `
        <div class="hidden-change">
          <span class="hidden-change-label">⋯ Change hidden</span>
          ${renderChangeTags(owner)}
          <span class="hidden-change-stats"><span class="plus">+${added}</span><span class="minus">−${removed}</span></span>
          <button class="reveal-button" type="button" data-reveal="${escapeHtml(changeKey(owner))}">Show once</button>
        </div>`;
  }

  function renderDiff(file: DiffFile, view: FileFilterView): string {
    if (file.binary) {
      return '<div class="empty-diff"><span class="binary-mark">01</span><strong>Binary file changed</strong><span>No text lines are available in the embedded patch.</span></div>';
    } else if (file.rows.length === 0) {
      return '<div class="empty-diff"><strong>No text rows</strong><span>The patch does not contain displayable lines for this file.</span></div>';
    } else {
      const blockStarts = new Map(changeBlocks(view.navigableRows).map((block, blockIndex) => [block.startRowIndex, blockIndex]));
      return file.rows.map((row, rowIndex) => {
        const owner = view.owners[rowIndex];
        const startsChange = owner !== undefined && owner !== view.owners[rowIndex - 1];
        let html = "";
        if (view.collapsed[rowIndex]) {
          html = startsChange ? renderHiddenChange(file, view, owner) : "";
        } else {
          let blockAttribute = blockStarts.has(rowIndex) ? `data-change-block="${blockStarts.get(rowIndex)}"` : "";
          if (startsChange && owner.tags.length > 0) {
            const revealed = isChangeHidden(owner, hiddenTags);
            html += `
        <div class="change-header${revealed ? " revealed" : ""}" ${blockAttribute}>
          ${revealed ? '<span class="change-header-label">Shown once</span>' : ""}
          ${renderChangeTags(owner)}
          ${revealed ? `<button class="reveal-button" type="button" data-conceal="${escapeHtml(changeKey(owner))}">Hide again</button>` : ""}
        </div>`;
            blockAttribute = "";
          }
          html += renderDiffRow(row, blockAttribute);
        }
        return html;
      }).join("");
    }
  }

  function renderMinimap(file: DiffFile, view: FileFilterView): string {
    const rowCount = file.rows.length;
    const mark = (kind: string, startRowIndex: number, endRowIndex: number): string => {
      const top = startRowIndex / rowCount * 100;
      const height = (endRowIndex - startRowIndex + 1) / rowCount * 100;
      return `<span class="minimap-mark ${kind}" style="top:${top}%;height:${height}%"></span>`;
    };
    const hiddenMarks: string[] = [];
    view.collapsed.forEach((collapsed, rowIndex) => {
      if (collapsed && !view.collapsed[rowIndex - 1]) {
        let endRowIndex = rowIndex;
        while (view.collapsed[endRowIndex + 1]) endRowIndex += 1;
        hiddenMarks.push(mark("hidden", rowIndex, endRowIndex));
      }
    });
    const marks = rowCount === 0
      ? ""
      : changeRuns(view.navigableRows).map((run) => mark(run.kind, run.startRowIndex, run.endRowIndex)).join("") + hiddenMarks.join("");
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
    const filtering = hiddenTags.size > 0;
    const isVisible = (id: string): boolean => filterStates.get(id)?.visible ?? true;
    const visibleTree = filtering ? filterTree(tree, isVisible) : tree;
    const visibleRowCount = (kind: "add" | "delete"): number => files.reduce((sum, file) => {
      const hidden = hiddenRows.get(file.path);
      return sum + file.rows.filter((row, rowIndex) => row.kind === kind && hidden?.[rowIndex] !== true).length;
    }, 0);
    const totalAdded = visibleRowCount("add");
    const totalRemoved = visibleRowCount("delete");
    const hiddenLineCount = files.reduce((sum, file) => sum + file.added + file.removed, 0) - totalAdded - totalRemoved;
    const fileEntries = Object.entries(index.elements).filter(([, element]) => element.kind === "file");
    const fileElements = fileEntries.map(([, element]) => element);
    const entityCount = Object.keys(index.elements).length - fileElements.length;
    const visibleFileCount = fileEntries.filter(([id]) => isVisible(id)).length;
    const visibleEntityCount = Object.entries(index.elements).filter(([id, element]) => element.kind !== "file" && isVisible(id)).length;
    const hiddenFileCount = fileElements.length - visibleFileCount;
    const hiddenEntityCount = entityCount - visibleEntityCount;
    const hiddenChangeCount = changes.filter((change) => isChangeHidden(change, hiddenTags)).length;
    const unmapped = fileElements.reduce((sum, element) => sum + unmatchedCount(element), 0);
    const file = selectedFile();
    const view = fileFilterView(file);
    const blockCount = changeBlocks(view.navigableRows).length;
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
          <button class="open-button" type="button" id="open-file">Open Enriched Patch</button>
          <input type="file" id="file-input" accept="application/json,.json" hidden>
        </header>
        ${statusMessage === "" ? "" : `<div class="status-banner">${escapeHtml(statusMessage)}</div>`}
        ${renderTagFilter(hiddenChangeCount, hiddenFileCount, hiddenEntityCount)}
        <div class="workspace" style="--sidebar-width:${sidebarWidth}px">
          <aside class="sidebar">
            <div class="sidebar-heading">
              <span>File structure</span>
              <div class="sidebar-actions">
                <button class="tree-toggle-button" type="button" id="toggle-tree" aria-controls="file-tree">${allExpanded ? "Collapse all" : "Expand all"}</button>
                <span class="file-count">${filtering ? `${visibleFileCount} / ${fileElements.length}` : fileElements.length}</span>
              </div>
            </div>
            <section class="summary-card">
              <div><strong>${totalAdded + totalRemoved}</strong><span>${filtering ? "changed lines shown" : "changed lines"}</span></div>
              <p>${filtering
                ? `${visibleFileCount} of ${fileElements.length} files · ${visibleEntityCount} of ${entityCount} entities`
                : `${fileElements.length} ${fileElements.length === 1 ? "file" : "files"} · ${entityCount} ${entityCount === 1 ? "entity" : "entities"}`}</p>
              <div class="summary-counts"><span class="plus">+${totalAdded}</span><span class="minus">−${totalRemoved}</span>${filtering && hiddenLineCount > 0 ? `<span>${hiddenLineCount} hidden</span>` : ""}${unmapped > 0 ? `<span>${unmapped} unmapped</span>` : ""}</div>
            </section>
            <nav class="file-tree" id="file-tree" aria-label="Changed files and code entities">${renderTree(visibleTree)}${filtering && hiddenFileCount + hiddenEntityCount > 0
              ? `<div class="filter-footnote"><span>${[
                hiddenFileCount === 0 ? "" : `${hiddenFileCount} ${hiddenFileCount === 1 ? "file" : "files"}`,
                hiddenEntityCount === 0 ? "" : `${hiddenEntityCount} ${hiddenEntityCount === 1 ? "entity" : "entities"}`,
              ].filter((part) => part !== "").join(" · ")} hidden by tag filter</span><button type="button" data-show-all>Show all</button></div>`
              : ""}</nav>
          </aside>
          <div class="sidebar-resizer" id="sidebar-resizer" role="separator" aria-label="Resize file navigation" aria-orientation="vertical" aria-valuemin="${MIN_SIDEBAR_WIDTH}" aria-valuemax="${MAX_SIDEBAR_WIDTH}" aria-valuenow="${sidebarWidth}" tabindex="0"></div>
          <main class="file-panel">
            <div class="file-bar">
              <span class="file-icon">${icon("file")}</span>
              <span class="file-path">${escapeHtml(file.path)}</span>
              <span class="file-stats"><span class="plus">+${file.rows.filter((row, rowIndex) => row.kind === "add" && !view.collapsed[rowIndex]).length}</span><span class="minus">−${file.rows.filter((row, rowIndex) => row.kind === "delete" && !view.collapsed[rowIndex]).length}</span></span>
              <div class="change-navigation" aria-label="Change navigation">
                ${blockCount === 0
                  ? `<span class="change-counter">${view.hiddenChangeCount > 0 ? "All changes hidden" : "No changes"}</span>`
                  : `<span class="change-counter" aria-live="polite">Change <strong id="current-change">–</strong> of <strong>${blockCount}</strong>${view.hiddenChangeCount > 0 ? `<span class="change-counter-hidden"> · ${view.hiddenChangeCount} hidden</span>` : ""}</span>`}
                <button class="change-button" id="previous-change" type="button" title="Previous change">↑ Prev</button>
                <button class="change-button" id="next-change" type="button" title="Next change">↓ Next</button>
              </div>
              <button class="wrap-button ${wrapLines ? "active" : ""}" type="button" id="toggle-wrap" aria-pressed="${wrapLines}" title="Wrap long lines (Alt/Option+Z)">Wrap <kbd>⌥/Alt Z</kbd></button>
            </div>
            <div class="diff-area">
              <div class="diff-scroll ${wrapLines ? "wrap-lines" : ""}" id="diff-scroll">
                <div class="diff-content" id="diff-content">${renderDiff(file, view)}</div>
                <div class="scroll-end-spacer" id="scroll-end-spacer" aria-hidden="true"></div>
              </div>
              ${renderMinimap(file, view)}
            </div>
          </main>
        </div>
        <div class="drop-overlay"><div><strong>Open enriched-patch.json</strong><span>Drop the file anywhere</span></div></div>
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
    for (const button of app.querySelectorAll<HTMLButtonElement>("[data-hide-tag]")) {
      button.addEventListener("click", () => toggleHiddenTag(button.dataset.hideTag!));
    }
    for (const button of app.querySelectorAll<HTMLButtonElement>("[data-show-all]")) {
      button.addEventListener("click", showAllTags);
    }
    for (const button of app.querySelectorAll<HTMLButtonElement>("[data-reveal]")) {
      button.addEventListener("click", () => setChangeRevealed(button.dataset.reveal!, true));
    }
    for (const button of app.querySelectorAll<HTMLButtonElement>("[data-conceal]")) {
      button.addEventListener("click", () => setChangeRevealed(button.dataset.conceal!, false));
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

  function renderPreservingScroll(): void {
    const diffScroll = app.querySelector<HTMLElement>("#diff-scroll")!;
    const scrollTop = diffScroll.scrollTop;
    const scrollLeft = diffScroll.scrollLeft;
    const navigationScrollTop = app.querySelector<HTMLElement>("#file-tree")!.scrollTop;
    render();
    const nextScroll = app.querySelector<HTMLElement>("#diff-scroll")!;
    nextScroll.scrollTop = scrollTop;
    nextScroll.scrollLeft = scrollLeft;
    app.querySelector<HTMLElement>("#file-tree")!.scrollTop = navigationScrollTop;
    updateChangeNavigation();
  }

  function toggleHiddenTag(tag: string): void {
    if (hiddenTags.has(tag)) {
      hiddenTags.delete(tag);
    } else {
      hiddenTags.add(tag);
    }
    revealedChanges = new Set();
    refreshTagFilter();
    renderPreservingScroll();
  }

  function showAllTags(): void {
    hiddenTags = new Set();
    revealedChanges = new Set();
    refreshTagFilter();
    renderPreservingScroll();
  }

  function setChangeRevealed(key: string, revealed: boolean): void {
    if (revealed) {
      revealedChanges.add(key);
    } else {
      revealedChanges.delete(key);
    }
    renderPreservingScroll();
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
    return errors?.map((error) => `${error.instancePath || "/"} ${error.message}`).join("; ") ?? "Invalid enriched patch";
  }

  function saveExpansion(): void {
    if (options.expansionStorageKey !== undefined && hasLoadedEnrichedPatch) {
      sessionStorage.setItem(options.expansionStorageKey, JSON.stringify([...expansionStates(buildTree(index), expandedIds)]));
    }
  }

  function loadEnrichedPatch(value: unknown, name: string, preserveView = false): void {
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
    const previousExpansion = hasLoadedEnrichedPatch
      ? expansionStates(buildTree(index), expandedIds)
      : new Map<string, boolean>(JSON.parse(
        options.expansionStorageKey === undefined ? "[]" : sessionStorage.getItem(options.expansionStorageKey) ?? "[]",
      ));
    index = value;
    files = parsedFiles;
    fileName = name;
    revealedChanges = new Set();
    refreshTagFilter(!preserveView && options.hideTagsByDefault === true);
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
        selectedId = initialSelection(index, false, filterStates);
      }
      history.replaceState(null, "", `#${encodeURIComponent(selectedId)}`);
    } else {
      selectedId = initialSelection(index, true, filterStates);
    }
    expandedIds = expandedNodeIds(buildTree(index), true, previousExpansion);
    hasLoadedEnrichedPatch = true;
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
      loadEnrichedPatch(JSON.parse(await file.text()), file.name);
    } catch (error) {
      statusMessage = error instanceof Error ? error.message : String(error);
      render();
    }
  }

  async function loadDefault(): Promise<void> {
    try {
      const response = await fetch("/__enriched-patch/default");
      if (response.ok && response.status !== 204) {
        const result = await response.json() as { fileName: string; contents: string };
        loadEnrichedPatch(JSON.parse(result.contents), result.fileName);
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

  refreshTagFilter(options.hideTagsByDefault === true);
  selectedId = initialSelection(index, true, filterStates);
  render();
  requestAnimationFrame(scrollToSelection);
  if (options.loadDefault !== false) void loadDefault();
  return { loadEnrichedPatch };
}
