import type { GraphLayout, GraphNode, Rect, ResolvedRelationship } from "./types.ts";
import { methodKey } from "./types.ts";

export const METHOD_HEIGHT = 32;
export const STATE_VARIABLE_HEIGHT = 20;
const STATE_VERTICAL_PADDING = 10;
const STATE_BORDER = 2;
const METHOD_GAP = 10;
const BOX_PADDING = 14;
const TAB_HEIGHT = 26;
const GAP_X = 64;
const GAP_Y = 128;
const COMPONENT_HEIGHT = 46;

function acyclicEdges(nodes: GraphNode[], edges: ResolvedRelationship[]): ResolvedRelationship[] {
  const kept: ResolvedRelationship[] = [];
  const adjacency = new Map(nodes.map((node) => [node.name, [] as string[]]));

  function createsCycle(from: string, to: string): boolean {
    const visited = new Set<string>();
    const stack = [to];
    while (stack.length > 0) {
      const current = stack.pop()!;
      if (current === from) return true;
      if (!visited.has(current)) {
        visited.add(current);
        stack.push(...(adjacency.get(current) ?? []));
      }
    }
    return false;
  }

  for (const edge of edges) {
    const from = edge.from.nodeName;
    const to = edge.to.nodeName;
    if (adjacency.has(from) && adjacency.has(to) && from !== to && !createsCycle(from, to)) {
      adjacency.get(from)!.push(to);
      kept.push(edge);
    }
  }
  return kept;
}

export function computeLayout(
  nodes: GraphNode[],
  relationships: ResolvedRelationship[],
  collapsed: boolean,
  measureMethod: (name: string, writesState: boolean) => number,
  measureStateVariable: (name: string) => number,
  measureComponent: (name: string) => number,
  stateWriters: Set<string>,
): GraphLayout {
  if (nodes.length === 0) {
    return { boxes: new Map(), methodRects: new Map(), stateRects: new Map(), compositionRelationships: [], width: 320, height: 240 };
  }

  const names = nodes.map((node) => node.name);
  const index = new Map(names.map((name, position) => [name, position]));
  const byName = new Map(nodes.map((node) => [node.name, node]));
  const rank = new Map(names.map((name) => [name, 0]));
  const composition = acyclicEdges(nodes, relationships.filter((item) => item.relationship.type === "composition"));
  const ownerOf = new Map<string, string>();
  const childrenOf = new Map(names.map((name) => [name, [] as string[]]));

  for (const edge of composition) {
    if (!ownerOf.has(edge.to.nodeName)) ownerOf.set(edge.to.nodeName, edge.from.nodeName);
    childrenOf.get(edge.from.nodeName)!.push(edge.to.nodeName);
  }

  function relaxComposition(): void {
    for (let pass = 0; pass <= nodes.length; pass += 1) {
      let moved = false;
      for (const edge of composition) {
        const nextRank = rank.get(edge.from.nodeName)! + 1;
        if (rank.get(edge.to.nodeName) !== nextRank) {
          rank.set(edge.to.nodeName, nextRank);
          moved = true;
        }
      }
      if (!moved) break;
    }
  }

  relaxComposition();
  const dataflows = relationships.filter((item) => item.relationship.type === "dataflow");
  const classFlows = dataflows.filter((edge) => !edge.from.component && !edge.to.component);
  const freeFlows = acyclicEdges(nodes, classFlows).filter(
    (edge) => !ownerOf.has(edge.to.nodeName) && !ownerOf.has(edge.from.nodeName),
  );
  for (let pass = 0; pass <= nodes.length; pass += 1) {
    let moved = false;
    for (const edge of freeFlows) {
      const nextRank = rank.get(edge.from.nodeName)! + 1;
      if (rank.get(edge.to.nodeName)! < nextRank) {
        rank.set(edge.to.nodeName, nextRank);
        moved = true;
      }
    }
    if (!moved) break;
  }
  relaxComposition();

  for (const node of nodes.filter((item) => item.componentType !== undefined)) {
    const outgoing = dataflows
      .filter((edge) => edge.from.nodeName === node.name && edge.to.nodeName !== node.name)
      .map((edge) => rank.get(edge.to.nodeName)!);
    const incoming = dataflows
      .filter((edge) => edge.to.nodeName === node.name && edge.from.nodeName !== node.name)
      .map((edge) => rank.get(edge.from.nodeName)!);
    if (outgoing.length > 0) {
      rank.set(node.name, Math.min(...outgoing) - 1);
    } else if (incoming.length > 0) {
      rank.set(node.name, Math.max(...incoming) + 1);
    }
  }

  const minimumRank = Math.min(...names.map((name) => rank.get(name)!));
  for (const name of names) rank.set(name, rank.get(name)! - minimumRank);

  function visibleMethods(node: GraphNode) {
    return collapsed || node.componentType !== undefined ? [] : node.methods;
  }

  function visibleStateVariables(node: GraphNode) {
    return node.componentType !== undefined ? [] : node.stateVariables;
  }

  function stateHeight(node: GraphNode): number {
    const stateVariables = visibleStateVariables(node);
    if (stateVariables.length === 0) {
      return 0;
    } else {
      return STATE_BORDER + stateVariables.length * STATE_VARIABLE_HEIGHT + STATE_VERTICAL_PADDING;
    }
  }

  function stateWidth(node: GraphNode): number {
    const stateVariables = visibleStateVariables(node);
    return stateVariables.length === 0 ? 0 : Math.max(...stateVariables.map((stateVariable) => measureStateVariable(stateVariable.name)));
  }

  function widthOf(node: GraphNode): number {
    if (node.componentType !== undefined) return Math.max(164, measureComponent(node.name) + 62);
    const methods = visibleMethods(node);
    const methodWidth = methods.reduce(
      (total, method) => total + measureMethod(method.name, stateWriters.has(methodKey(node.name, method.name))) + METHOD_GAP,
      -METHOD_GAP,
    );
    const stateBoxWidth = stateWidth(node);
    const contentWidth = stateBoxWidth + (stateBoxWidth > 0 && methodWidth > 0 ? METHOD_GAP : 0) + Math.max(0, methodWidth);
    return Math.max(contentWidth + BOX_PADDING * 2, node.name.length * 7.4 + 120, 216);
  }

  function heightOf(node: GraphNode): number {
    if (node.componentType !== undefined) return COMPONENT_HEIGHT;
    const methodHeight = visibleMethods(node).length > 0 ? METHOD_HEIGHT : 0;
    const contentHeight = Math.max(methodHeight, stateHeight(node));
    if (contentHeight === 0) {
      return TAB_HEIGHT + BOX_PADDING * 2 + 4;
    } else {
      return TAB_HEIGHT + contentHeight + BOX_PADDING;
    }
  }

  const maximumRank = Math.max(...names.map((name) => rank.get(name)!));
  const rowTops: number[] = [];
  let y = 0;
  for (let row = 0; row <= maximumRank; row += 1) {
    rowTops.push(y);
    const rowNodes = nodes.filter((node) => rank.get(node.name) === row);
    y += (rowNodes.length > 0 ? Math.max(...rowNodes.map(heightOf)) : 0) + GAP_Y;
  }

  const x = new Map<string, number>();
  let cursor = 0;
  function place(name: string): number {
    if (x.has(name)) return x.get(name)!;
    const children = childrenOf.get(name)!.slice().sort((a, b) => index.get(a)! - index.get(b)!);
    if (children.length === 0) {
      x.set(name, cursor);
      cursor += widthOf(byName.get(name)!) + GAP_X;
    } else {
      const spans = children.map((child) => {
        const childX = place(child);
        return [childX, childX + widthOf(byName.get(child)!)] as const;
      });
      const middle = (Math.min(...spans.map((span) => span[0])) + Math.max(...spans.map((span) => span[1]))) / 2;
      x.set(name, middle - widthOf(byName.get(name)!) / 2);
    }
    return x.get(name)!;
  }

  const roots = names
    .filter((name) => !ownerOf.has(name))
    .sort((a, b) => rank.get(a)! - rank.get(b)! || index.get(a)! - index.get(b)!);
  for (const root of roots) place(root);
  for (const name of names) place(name);

  for (const edge of freeFlows.concat(dataflows.filter((flow) => flow.from.component))) {
    if (ownerOf.has(edge.from.nodeName) || childrenOf.get(edge.from.nodeName)!.length > 0) continue;
    if (rank.get(edge.from.nodeName)! >= rank.get(edge.to.nodeName)!) continue;
    x.set(
      edge.from.nodeName,
      x.get(edge.to.nodeName)! + (widthOf(byName.get(edge.to.nodeName)!) - widthOf(byName.get(edge.from.nodeName)!)) / 2,
    );
  }

  const rows = Array.from({ length: maximumRank + 1 }, (_, row) =>
    names.filter((name) => rank.get(name) === row).sort((a, b) => x.get(a)! - x.get(b)!),
  );
  const rowWidths = rows.map(
    (rowNames) => rowNames.reduce((total, name) => total + widthOf(byName.get(name)!), 0) + Math.max(0, rowNames.length - 1) * GAP_X,
  );
  const maximumRowWidth = Math.max(...rowWidths);
  for (const [row, rowNames] of rows.entries()) {
    let edge = (maximumRowWidth - rowWidths[row]) / 2;
    for (const name of rowNames) {
      x.set(name, edge);
      edge += widthOf(byName.get(name)!) + GAP_X;
    }
  }

  const minimumX = Math.min(...names.map((name) => x.get(name)!));
  const boxes = new Map<string, Rect>();
  const methodRects = new Map<string, Rect>();
  const stateRects = new Map<string, Rect>();
  for (const node of nodes) {
    const box = {
      x: x.get(node.name)! - minimumX,
      y: rowTops[rank.get(node.name)!],
      width: widthOf(node),
      height: heightOf(node),
    };
    boxes.set(node.name, box);
    let methodX = box.x + BOX_PADDING;
    if (visibleStateVariables(node).length > 0) {
      const width = stateWidth(node);
      stateRects.set(node.name, {
        x: methodX,
        y: box.y + TAB_HEIGHT,
        width,
        height: stateHeight(node),
      });
      methodX += width + METHOD_GAP;
    }
    for (const method of visibleMethods(node)) {
      const width = measureMethod(method.name, stateWriters.has(methodKey(node.name, method.name)));
      methodRects.set(methodKey(node.name, method.name), {
        x: methodX,
        y: box.y + TAB_HEIGHT,
        width,
        height: METHOD_HEIGHT,
      });
      methodX += width + METHOD_GAP;
    }
  }

  return {
    boxes,
    methodRects,
    stateRects,
    compositionRelationships: composition,
    width: Math.max(320, ...nodes.map((node) => boxes.get(node.name)!.x + boxes.get(node.name)!.width)),
    height: Math.max(240, y - GAP_Y),
  };
}
