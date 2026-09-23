import { escapeHtml, selectionKey } from "./html.ts";
import type { DiffHunk, NodeType, Selection, SystemDataflow } from "./types.ts";

export interface ParsedHunk {
  oldStart: number;
  oldCount: number;
  newStart: number;
  newCount: number;
  context: string;
  lines: { kind: "add" | "del" | "context" | "meta"; text: string }[];
  added: number;
  removed: number;
}

/** Splits a unified diff hunk into its @@ header ranges and signed lines. */
export function parseHunk(patch: string): ParsedHunk {
  const [header = "", ...body] = patch.replace(/\r/g, "").replace(/\n$/, "").split("\n");
  const match = /^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@ ?(.*)$/.exec(header);
  const lines = body.map((line): ParsedHunk["lines"][number] => {
    const sign = line.charAt(0);
    if (sign === "+") {
      return { kind: "add", text: line.slice(1) };
    } else if (sign === "-") {
      return { kind: "del", text: line.slice(1) };
    } else if (sign === "\\") {
      return { kind: "meta", text: line.slice(1).trim() };
    } else {
      return { kind: "context", text: line.slice(1) };
    }
  });
  return {
    oldStart: Number(match?.[1] ?? 0),
    oldCount: match?.[2] === undefined ? 1 : Number(match[2]),
    newStart: Number(match?.[3] ?? 0),
    newCount: match?.[4] === undefined ? 1 : Number(match[4]),
    context: match === null ? header : match[5].trim(),
    lines,
    added: lines.filter((line) => line.kind === "add").length,
    removed: lines.filter((line) => line.kind === "del").length,
  };
}

/** The enclosing function from the @@ header when git supplies one, otherwise the line range. */
export function hunkLocation(hunk: ParsedHunk): string {
  if (hunk.context !== "") {
    return hunk.context;
  } else if (hunk.oldStart === 0 && hunk.oldCount === 0) {
    return "new file";
  } else if (hunk.newStart === 0 && hunk.newCount === 0) {
    return "deleted file";
  }
  const [start, count] = hunk.newCount === 0 ? [hunk.oldStart, hunk.oldCount] : [hunk.newStart, hunk.newCount];
  return count <= 1 ? `line ${start}` : `lines ${start}–${start + count - 1}`;
}

/** Every node and relationship that cites each hunk, so a shared hunk can link to its other owners. */
export function hunkReferences(dataflow: SystemDataflow): Map<string, Selection[]> {
  const references = new Map<string, Selection[]>();
  const add = (id: string, owner: Selection): void => {
    references.set(id, [...(references.get(id) ?? []), owner]);
  };
  for (const node of dataflow.nodes) {
    for (const id of node.diffHunkIds ?? []) add(id, { type: "node", name: node.name });
  }
  for (const relationship of dataflow.relationships) {
    for (const id of relationship.diffHunkIds ?? []) add(id, { type: "relationship", id: relationship.id });
  }
  return references;
}

/** Five boxes split between added and removed lines, like a git diffstat; all empty when nothing changed. */
export function diffstatBoxes(added: number, removed: number): ("add" | "del" | "")[] {
  const total = added + removed;
  const addedBoxes = total === 0 ? 0 : Math.round((5 * added) / total);
  const removedBoxes = total === 0 ? 0 : 5 - addedBoxes;
  return [
    ...Array<"add">(addedBoxes).fill("add"),
    ...Array<"del">(removedBoxes).fill("del"),
    ...Array<"">(5 - addedBoxes - removedBoxes).fill(""),
  ];
}

/** Leading whitespace width in characters, counting a tab as two, so wrapped lines hang under their own code. */
export function lineIndent(text: string): number {
  return (/^[ \t]*/.exec(text)?.[0] ?? "").replace(/\t/g, "  ").length;
}

function diffCounts(added: number, removed: number): string {
  return `<span class="diff-counts"><span class="diff-add">+${added}</span> <span class="diff-del">−${removed}</span></span>`;
}

function diffstat(added: number, removed: number): string {
  return `<span class="diffstat" aria-hidden="true">${diffstatBoxes(added, removed).map((kind) => `<i class="${kind}"></i>`).join("")}</span>`;
}

function hunkPath(file: string): string {
  const slash = file.lastIndexOf("/");
  const directory = slash === -1 ? "" : file.slice(0, slash + 1);
  return `<span class="hunk-path" title="${escapeHtml(file)}"><span class="hunk-dir">${escapeHtml(directory)}</span>${escapeHtml(file.slice(slash + 1))}</span>`;
}

function hunkCode(hunk: ParsedHunk): string {
  const signs = { add: "+", del: "−", context: "", meta: "" };
  return hunk.lines
    .map((line) => {
      // wrapped continuations hang under the line's own indentation rather than the gutter
      return `<div class="hunk-line ${line.kind}"><span class="hunk-sign">${signs[line.kind]}</span><span class="hunk-text" style="--indent:${lineIndent(line.text)}ch">${line.text === "" ? " " : escapeHtml(line.text)}</span></div>`;
    })
    .join("");
}

function hunkOwners(owners: Selection[], context: DiffSectionContext): string {
  if (owners.length === 0) {
    return "";
  }
  const links = owners
    .map((owner) => {
      if (owner.type === "node") {
        const node = context.dataflow.nodes.find((item) => item.name === owner.name);
        return `<button class="hunk-owner" data-jump-node="${escapeHtml(owner.name)}">${node === undefined ? "" : context.badge(node.type)}<span>${escapeHtml(owner.name)}</span></button>`;
      } else {
        return `<button class="hunk-owner relationship" data-jump-relationship="${escapeHtml(owner.id)}">${escapeHtml(owner.id)}</button>`;
      }
    })
    .join("");
  return `<div class="hunk-owners"><span class="hunk-owners-label">Also used by</span>${links}</div>`;
}

export interface DiffSectionContext {
  dataflow: SystemDataflow;
  /** The expanded hunk remembered for an entity; a null id means all collapsed. Absent or another entity's: the first opens. */
  openHunk: { owner: string; id: string | null } | undefined;
  /** Renders a node type's badge, as the graph cards and inspector header do. */
  badge: (nodeType: NodeType) => string;
  colors: { added: string; deleted: string };
}

/** The Relevant diff section: one row per hunk, with at most one expanded. Empty when nothing cites a hunk. */
export function renderDiffSection(owner: Selection, hunkIds: string[] | undefined, context: DiffSectionContext): string {
  if (hunkIds === undefined || hunkIds.length === 0) {
    return "";
  }
  const ownerKey = selectionKey(owner);
  const expandedId = context.openHunk?.owner === ownerKey ? context.openHunk.id : hunkIds[0];
  const hunks = new Map((context.dataflow.diffHunks ?? []).map((hunk): [string, DiffHunk] => [hunk.id, hunk]));
  const references = hunkReferences(context.dataflow);
  let totalAdded = 0;
  let totalRemoved = 0;
  const rows = hunkIds
    .map((id, index) => {
      const hunk = hunks.get(id);
      if (hunk === undefined) {
        return `<div class="hunk"><p class="hunk-missing">${escapeHtml(id)} is not in diffHunks</p></div>`;
      }
      const parsed = parseHunk(hunk.patch);
      totalAdded += parsed.added;
      totalRemoved += parsed.removed;
      const expanded = id === expandedId;
      const others = (references.get(id) ?? []).filter((reference) => selectionKey(reference) !== ownerKey);
      const panelId = `hunk-panel-${index}`;
      return `<div class="hunk">
        <button class="hunk-toggle" aria-expanded="${expanded}" aria-controls="${panelId}" data-hunk-owner="${escapeHtml(ownerKey)}" data-hunk-open="${expanded ? "" : escapeHtml(id)}">
          <svg class="hunk-chevron" width="12" height="12" viewBox="0 0 12 12" aria-hidden="true"><path d="M4.5 2.5 8 6 4.5 9.5"></path></svg>
          <span class="hunk-summary">${hunkPath(hunk.file)}<span class="hunk-location">${escapeHtml(hunkLocation(parsed))}</span></span>
          <span class="hunk-meta">
            <span class="hunk-stats">${others.length === 0 ? "" : `<span class="hunk-shared">shared ×${others.length}</span>`}${diffCounts(parsed.added, parsed.removed)}</span>
            ${diffstat(parsed.added, parsed.removed)}
          </span>
        </button>
        ${expanded ? `<div class="hunk-body" id="${panelId}"><div class="hunk-code">${hunkCode(parsed)}</div>${hunkOwners(others, context)}</div>` : ""}
      </div>`;
    })
    .join("");
  const style = `--added:${context.colors.added};--deleted:${context.colors.deleted}`;
  return `<section class="inspector-section diff-section" style="${style}">
    <div class="section-heading"><span>Relevant diff</span>${diffCounts(totalAdded, totalRemoved)}<span class="inspector-count">${hunkIds.length}</span></div>
    <div class="hunk-list">${rows}</div>
  </section>`;
}
