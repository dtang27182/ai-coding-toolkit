import { lineIsInRange } from "./patch.ts";
import type { ChangeType, DiffElement, DiffFile, DiffIndex, ElementStats } from "./types.ts";

export interface DirectoryNode {
  kind: "directory";
  id: string;
  name: string;
  path: string;
  sortKey: string;
  children: TreeNode[];
}

export interface ElementNode {
  kind: "element";
  id: string;
  element: DiffElement;
  sortKey: string;
  children: ElementNode[];
}

export type TreeNode = DirectoryNode | ElementNode;

function elementSortKey(index: DiffIndex, id: string): string {
  const element = index.elements[id];
  let key;
  if (element.parentId === undefined) {
    key = element.name;
  } else {
    key = `${elementSortKey(index, element.parentId)}/${element.name}`;
  }
  return key;
}

function sortNodes(nodes: TreeNode[]): void {
  nodes.sort((left, right) => left.sortKey.localeCompare(right.sortKey));
  for (const node of nodes) {
    sortNodes(node.children);
  }
}

export function buildTree(index: DiffIndex): TreeNode[] {
  const nodes = new Map<string, ElementNode>();
  const roots: ElementNode[] = [];
  for (const [id, element] of Object.entries(index.elements)) {
    nodes.set(id, { kind: "element", id, element, sortKey: elementSortKey(index, id), children: [] });
  }
  for (const node of nodes.values()) {
    if (node.element.parentId === undefined) {
      roots.push(node);
    } else {
      nodes.get(node.element.parentId)!.children.push(node);
    }
  }
  const tree: TreeNode[] = [];
  for (const fileNode of roots) {
    const segments = fileNode.element.name.split("/");
    let children = tree;
    let directoryPath = "";
    for (const segment of segments.slice(0, -1)) {
      directoryPath = directoryPath === "" ? segment : `${directoryPath}/${segment}`;
      let directory = children.find(
        (candidate): candidate is DirectoryNode => candidate.kind === "directory" && candidate.name === segment,
      );
      if (directory === undefined) {
        directory = {
          kind: "directory",
          id: `directory:${directoryPath}`,
          name: segment,
          path: directoryPath,
          sortKey: directoryPath,
          children: [],
        };
        children.push(directory);
      }
      children = directory.children;
    }
    children.push(fileNode);
  }
  sortNodes(tree);
  return tree;
}

function expandableNodes(nodes: TreeNode[]): TreeNode[] {
  const expandable: TreeNode[] = [];

  function visit(children: TreeNode[]): void {
    for (const node of children) {
      if (node.children.length > 0) {
        expandable.push(node);
        visit(node.children);
      }
    }
  }

  visit(nodes);
  return expandable;
}

function expansionKey(node: TreeNode): string {
  return JSON.stringify([node.kind === "directory" ? "directory" : node.element.kind, node.sortKey]);
}

export function expansionStates(nodes: TreeNode[], expandedIds: Set<string>): Map<string, boolean> {
  const states = new Map<string, boolean>();
  const duplicates = new Set<string>();
  for (const node of expandableNodes(nodes)) {
    const key = expansionKey(node);
    if (states.has(key)) {
      states.delete(key);
      duplicates.add(key);
    } else if (!duplicates.has(key)) {
      states.set(key, expandedIds.has(node.id));
    }
  }
  return states;
}

export function expandedNodeIds(
  nodes: TreeNode[],
  expandElements = true,
  previousStates = new Map<string, boolean>(),
): Set<string> {
  const expanded = new Set<string>();
  const expandable = expandableNodes(nodes);
  const counts = new Map<string, number>();
  for (const node of expandable) {
    const key = expansionKey(node);
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  for (const node of expandable) {
    const key = expansionKey(node);
    const wasExpanded = counts.get(key) === 1 ? previousStates.get(key) : undefined;
    if (wasExpanded ?? (expandElements || (node.kind === "directory" && node.children.some((child) => child.kind === "directory")))) {
      expanded.add(node.id);
    }
  }
  return expanded;
}

function locationChangeType(element: DiffElement): ChangeType {
  const hasOld = element.locations.some((location) => location.oldLines !== null);
  const hasNew = element.locations.some((location) => location.newLines !== null);
  if (hasNew && !hasOld) {
    return "added";
  } else if (hasOld && !hasNew) {
    return "deleted";
  } else {
    return "modified";
  }
}

export function statsForElement(element: DiffElement, files: DiffFile[]): ElementStats {
  const filePath = element.kind === "file" ? element.name : element.locations[0].file;
  const file = files.find((candidate) => candidate.path === filePath);
  if (element.kind === "file") {
    let changeType: ChangeType;
    if (file!.oldPath === null) {
      changeType = "added";
    } else if (file!.newPath === null) {
      changeType = "deleted";
    } else {
      changeType = "modified";
    }
    return { added: file!.added, removed: file!.removed, changeType };
  } else {
    let added = 0;
    let removed = 0;
    for (const row of file!.rows) {
      if (row.kind === "add" && element.locations.some((location) => lineIsInRange(row.newLine, location.newLines))) {
        added += 1;
      } else if (row.kind === "delete" && element.locations.some((location) => lineIsInRange(row.oldLine, location.oldLines))) {
        removed += 1;
      }
    }
    return { added, removed, changeType: locationChangeType(element) };
  }
}

export function unmatchedCount(element: DiffElement): number {
  return element.locations.reduce((total, location) => {
    const oldCount = location.oldLines === null ? 0 : location.oldLines[1] - location.oldLines[0] + 1;
    const newCount = location.newLines === null ? 0 : location.newLines[1] - location.newLines[0] + 1;
    return total + oldCount + newCount;
  }, 0);
}

export function semanticError(index: DiffIndex, files: DiffFile[]): string | undefined {
  const elements = Object.entries(index.elements);
  const patchPaths = new Set(files.map((file) => file.path));
  for (const [id, element] of elements) {
    if (element.kind === "file" && !patchPaths.has(element.name)) {
      return `${id} refers to a file that is not in the patch: ${element.name}`;
    } else if (element.parentId !== undefined && index.elements[element.parentId] === undefined) {
      return `${id}.parentId does not reference an element: ${element.parentId}`;
    } else if (element.kind === "class" && index.elements[element.parentId!]?.kind !== "file") {
      return `${id} must have a file parent`;
    } else if (
      element.kind === "method" &&
      index.elements[element.parentId!]?.kind !== "file" &&
      index.elements[element.parentId!]?.kind !== "class"
    ) {
      return `${id} must have a file or class parent`;
    }
    for (const location of element.locations) {
      if (!patchPaths.has(location.file)) {
        return `${id} refers to a file that is not in the patch: ${location.file}`;
      } else if (location.oldLines !== null && location.oldLines[1] < location.oldLines[0]) {
        return `${id} has an invalid old line range`;
      } else if (location.newLines !== null && location.newLines[1] < location.newLines[0]) {
        return `${id} has an invalid new line range`;
      }
    }
  }
  return undefined;
}
