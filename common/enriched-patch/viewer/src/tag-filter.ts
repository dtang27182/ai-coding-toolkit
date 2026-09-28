import { lineIsInRange } from "./patch.ts";
import type { DiffChange, DiffElement, DiffFile, DiffRow, EnrichedPatch } from "./types.ts";

/** Tags defined by the enriched-patch schema, in display order. Unknown tags sort after these. */
export const KNOWN_TAGS = ["non-code", "test-code", "initialization", "data-plumbing"];

// Ten colors that stay clear of the green / amber / red used for added, modified and deleted.
const TAG_PALETTE = [
  "#8fa3b1",
  "#f0883e",
  "#b392f0",
  "#3fb9b0",
  "#58a6ff",
  "#e58fc0",
  "#7fd1e8",
  "#c9c27a",
  "#9d8cff",
  "#d8a6ff",
];

export interface OwnedChange extends DiffChange {
  elementId: string;
  file: string;
}

export interface TagCount {
  tag: string;
  count: number;
  color: string;
}

export interface ElementFilterState {
  /** False when every change in the element's subtree is hidden. Elements without changes stay visible. */
  visible: boolean;
  totalChanges: number;
  hiddenChanges: number;
  /** Tags on the subtree's visible changes, in display order. */
  visibleTags: string[];
}

export function elementFile(element: DiffElement): string {
  return element.kind === "file" ? element.name : element.locations[0].file;
}

export function collectChanges(index: EnrichedPatch): OwnedChange[] {
  const changes: OwnedChange[] = [];
  for (const [elementId, element] of Object.entries(index.elements)) {
    for (const change of element.changes ?? []) {
      changes.push({ ...change, elementId, file: elementFile(element) });
    }
  }
  return changes;
}

function compareTags(left: string, right: string): number {
  const leftIndex = KNOWN_TAGS.indexOf(left);
  const rightIndex = KNOWN_TAGS.indexOf(right);
  if (leftIndex !== -1 || rightIndex !== -1) {
    return (leftIndex === -1 ? Infinity : leftIndex) - (rightIndex === -1 ? Infinity : rightIndex);
  } else {
    return left.localeCompare(right);
  }
}

export function sortTags(tags: Iterable<string>): string[] {
  return [...new Set(tags)].sort(compareTags);
}

/** Tags that appear on at least one change, each with its change count and display color. */
export function tagCounts(changes: OwnedChange[]): TagCount[] {
  const counts = new Map<string, number>();
  for (const change of changes) {
    for (const tag of change.tags) {
      counts.set(tag, (counts.get(tag) ?? 0) + 1);
    }
  }
  const unknown = sortTags([...counts.keys()].filter((tag) => !KNOWN_TAGS.includes(tag)));
  return sortTags(counts.keys()).map((tag) => {
    const known = KNOWN_TAGS.indexOf(tag);
    const paletteIndex = known !== -1 ? known : KNOWN_TAGS.length + unknown.indexOf(tag);
    return { tag, count: counts.get(tag)!, color: TAG_PALETTE[paletteIndex % TAG_PALETTE.length] };
  });
}

/** A change is hidden when it carries any hidden tag. */
export function isChangeHidden(change: DiffChange, hiddenTags: ReadonlySet<string>): boolean {
  return change.tags.some((tag) => hiddenTags.has(tag));
}

export function changeKey(change: OwnedChange): string {
  return JSON.stringify([change.elementId, change.oldLines, change.newLines]);
}

function changeContainsRow(change: DiffChange, row: DiffRow): boolean {
  return (row.kind === "add" && lineIsInRange(row.newLine, change.newLines)) ||
    (row.kind === "delete" && lineIsInRange(row.oldLine, change.oldLines));
}

/** The owning change for each row of a file; undefined for context rows and untagged patches. */
export function rowChanges(file: DiffFile, changes: OwnedChange[]): (OwnedChange | undefined)[] {
  const fileChanges = changes.filter((change) => change.file === file.path);
  return file.rows.map((row) => row.kind === "context" ? undefined : fileChanges.find((change) => changeContainsRow(change, row)));
}

/** For each file path, which rows belong to a hidden change. */
export function hiddenRowsByFile(files: DiffFile[], changes: OwnedChange[], hiddenTags: ReadonlySet<string>): Map<string, boolean[]> {
  return new Map(files.map((file) => [
    file.path,
    rowChanges(file, changes).map((change) => change !== undefined && isChangeHidden(change, hiddenTags)),
  ]));
}

export function elementFilterStates(index: EnrichedPatch, hiddenTags: ReadonlySet<string>): Map<string, ElementFilterState> {
  const children = new Map<string, string[]>();
  for (const [id, element] of Object.entries(index.elements)) {
    if (element.parentId !== undefined) {
      children.set(element.parentId, [...(children.get(element.parentId) ?? []), id]);
    }
  }
  const states = new Map<string, ElementFilterState>();

  function visit(id: string): ElementFilterState {
    let state = states.get(id);
    if (state === undefined) {
      let totalChanges = 0;
      let hiddenChanges = 0;
      const tags = new Set<string>();
      for (const change of index.elements[id].changes ?? []) {
        totalChanges += 1;
        if (isChangeHidden(change, hiddenTags)) {
          hiddenChanges += 1;
        } else {
          change.tags.forEach((tag) => tags.add(tag));
        }
      }
      for (const childId of children.get(id) ?? []) {
        const child = visit(childId);
        totalChanges += child.totalChanges;
        hiddenChanges += child.hiddenChanges;
        child.visibleTags.forEach((tag) => tags.add(tag));
      }
      state = {
        visible: totalChanges === 0 || hiddenChanges < totalChanges,
        totalChanges,
        hiddenChanges,
        visibleTags: sortTags(tags),
      };
      states.set(id, state);
    }
    return state;
  }

  Object.keys(index.elements).forEach(visit);
  return states;
}
