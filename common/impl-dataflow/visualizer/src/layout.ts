import type { GraphLayout, GraphNode, HelperMember, Rect, ResolvedRelationship } from "./types.ts";
import type { FunctionNode } from "../../types.ts";

export const FUNCTION_HEIGHT = 32;
export const STATE_VARIABLE_HEIGHT = 20;
const STATE_VERTICAL_PADDING = 10;
const STATE_BORDER = 2;
const FUNCTION_GAP = 10;
const HELPER_FRAME_PADDING = 7;
const BOX_PADDING = 14;
const TAB_HEIGHT = 26;
const GAP_X = 64;
const GAP_Y = 128;
const COMPONENT_HEIGHT = 46;

function withMissingFunctions(layout: GraphLayout, missingFunctions: FunctionNode[]): GraphLayout {
  if (missingFunctions.length > 0) {
    const width = 320;
    const offset = width + GAP_X;
    for (const rect of [...layout.boxes.values(), ...layout.memberRects.values(), ...layout.helperFrameRects.values(), ...layout.stateRects.values()]) {
      rect.x += offset;
    }
    for (const [index, node] of missingFunctions.entries()) {
      layout.missingFunctionRects.set(node.id, { x: 0, y: 48 + index * 100, width, height: 86 });
    }
    layout.width = layout.boxes.size === 0 ? width : layout.width + offset;
    layout.height = Math.max(layout.height, 48 + missingFunctions.length * 100);
  }
  return layout;
}

function acyclicEdges(nodes: GraphNode[], edges: ResolvedRelationship[]): ResolvedRelationship[] {
  const kept: ResolvedRelationship[] = [];
  const adjacency = new Map(nodes.map((node) => [node.id, [] as string[]]));

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
    const from = edge.from.boxId;
    const to = edge.to.boxId;
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
  measureFunction: (name: string, writesState: boolean, mismatch?: boolean, hasHelpers?: boolean) => number,
  measureStateVariable: (name: string) => number,
  measureComponent: (name: string) => number,
  stateWriters: Set<string>,
  missingFunctions: FunctionNode[] = [],
  helperGroups: ReadonlyMap<string, HelperMember[]> = new Map(),
  allHelperGroups: ReadonlyMap<string, HelperMember[]> = helperGroups,
): GraphLayout {
  if (nodes.length === 0) {
    return withMissingFunctions({ boxes: new Map(), memberRects: new Map(), helperFrameRects: new Map(), missingFunctionRects: new Map(), stateRects: new Map(), compositionRelationships: [], width: 320, height: 240 }, missingFunctions);
  }

  const ids = nodes.map((node) => node.id);
  const index = new Map(ids.map((id, position) => [id, position]));
  const byId = new Map(nodes.map((node) => [node.id, node]));
  const rank = new Map(ids.map((id) => [id, 0]));
  const composition = acyclicEdges(nodes, relationships.filter((item) => item.relationship.type === "composition"));
  const ownerOf = new Map<string, string>();
  const childrenOf = new Map(ids.map((id) => [id, [] as string[]]));

  for (const edge of composition) {
    if (!ownerOf.has(edge.to.boxId)) ownerOf.set(edge.to.boxId, edge.from.boxId);
    childrenOf.get(edge.from.boxId)!.push(edge.to.boxId);
  }

  function relaxComposition(): void {
    for (let pass = 0; pass <= nodes.length; pass += 1) {
      let moved = false;
      for (const edge of composition) {
        const nextRank = rank.get(edge.from.boxId)! + 1;
        if (rank.get(edge.to.boxId) !== nextRank) {
          rank.set(edge.to.boxId, nextRank);
          moved = true;
        }
      }
      if (!moved) break;
    }
  }

  relaxComposition();
  const dataflows = relationships.filter((item) => item.relationship.type === "dataflow");
  const containerFlows = dataflows.filter((edge) => byId.get(edge.from.boxId)!.nodeType === undefined && byId.get(edge.to.boxId)!.nodeType === undefined);
  const freeFlows = acyclicEdges(nodes, containerFlows).filter(
    (edge) => !ownerOf.has(edge.to.boxId) && !ownerOf.has(edge.from.boxId),
  );
  for (let pass = 0; pass <= nodes.length; pass += 1) {
    let moved = false;
    for (const edge of freeFlows) {
      const nextRank = rank.get(edge.from.boxId)! + 1;
      if (rank.get(edge.to.boxId)! < nextRank) {
        rank.set(edge.to.boxId, nextRank);
        moved = true;
      }
    }
    if (!moved) break;
  }
  relaxComposition();

  for (const node of nodes.filter((item) => item.nodeType === "external-dependency")) {
    const outgoing = dataflows
      .filter((edge) => edge.from.boxId === node.id && edge.to.boxId !== node.id)
      .map((edge) => rank.get(edge.to.boxId)!);
    const incoming = dataflows
      .filter((edge) => edge.to.boxId === node.id && edge.from.boxId !== node.id)
      .map((edge) => rank.get(edge.from.boxId)!);
    if (outgoing.length > 0) {
      rank.set(node.id, Math.min(...outgoing) - 1);
    } else if (incoming.length > 0) {
      rank.set(node.id, Math.max(...incoming) + 1);
    }
  }

  const sources = nodes.filter((node) => node.uiDirection === "read" || node.nodeType === "system-input" || node.nodeType === "static-data");
  const outputs = nodes.filter((node) => node.uiDirection === "write" || node.nodeType === "system-output");
  const sourceRank = Math.min(...rank.values()) - 1;
  const outputRank = Math.max(...rank.values()) + 1;
  for (const node of sources) rank.set(node.id, sourceRank);
  for (const node of outputs) rank.set(node.id, outputRank);

  const minimumRank = Math.min(...ids.map((id) => rank.get(id)!));
  for (const id of ids) rank.set(id, rank.get(id)! - minimumRank);

  function visibleMembers(node: GraphNode) {
    return collapsed || node.nodeType !== undefined ? [] : node.functions;
  }

  const expandedHelperIds = new Set([...helperGroups.values()].flatMap((members) => members.map(({ node }) => node.id)));
  function topMembers(node: GraphNode): FunctionNode[] {
    return visibleMembers(node).filter((member) => !expandedHelperIds.has(member.id));
  }

  function memberWidth(member: FunctionNode): number {
    return measureFunction(member.name, stateWriters.has(member.id), member["hld-change-mismatch"], allHelperGroups.has(member.id));
  }

  function groupWidth(member: FunctionNode): number {
    return memberWidth(member) + (helperGroups.get(member.id) ?? []).reduce((width, { node }) => width + FUNCTION_GAP + memberWidth(node), 0);
  }

  function visibleStateVariables(node: GraphNode) {
    return collapsed || node.nodeType !== undefined ? [] : node.stateVariables;
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
    if (collapsed || node.nodeType !== undefined) {
      return Math.max(164, measureComponent(node.name) + 62);
    } else {
      const members = topMembers(node);
      const memberWidth = members.reduce(
        (total, member) => total + groupWidth(member) + FUNCTION_GAP,
        -FUNCTION_GAP,
      );
      const stateBoxWidth = stateWidth(node);
      const contentWidth = stateBoxWidth + (stateBoxWidth > 0 && memberWidth > 0 ? FUNCTION_GAP : 0) + Math.max(0, memberWidth);
      return Math.max(contentWidth + BOX_PADDING * 2, node.name.length * 7.4 + 120, 216);
    }
  }

  function heightOf(node: GraphNode): number {
    if (collapsed || node.nodeType !== undefined) {
      return COMPONENT_HEIGHT;
    } else {
      const memberHeight = topMembers(node).length > 0 ? FUNCTION_HEIGHT : 0;
      const contentHeight = Math.max(memberHeight, stateHeight(node));
      if (contentHeight === 0) {
        return TAB_HEIGHT + BOX_PADDING * 2 + 4;
      } else {
        return TAB_HEIGHT + contentHeight + BOX_PADDING;
      }
    }
  }

  const maximumRank = Math.max(...ids.map((id) => rank.get(id)!));
  const rowTops: number[] = [];
  let y = 0;
  let lastRowGap = GAP_Y;
  for (let row = 0; row <= maximumRank; row += 1) {
    rowTops.push(y);
    const rowNodes = nodes.filter((node) => rank.get(node.id) === row);
    const widestHelperGroup = Math.max(0, ...rowNodes.flatMap((node) => topMembers(node).filter((member) => helperGroups.has(member.id)).map(groupWidth)));
    // Same-row call edges bow farther as a helper group widens.
    lastRowGap = Math.max(GAP_Y, 80 + widestHelperGroup / 8);
    y += (rowNodes.length > 0 ? Math.max(...rowNodes.map(heightOf)) : 0) + lastRowGap;
  }

  const x = new Map<string, number>();
  let cursor = 0;
  function place(id: string): number {
    if (x.has(id)) return x.get(id)!;
    const children = childrenOf.get(id)!.slice().sort((a, b) => index.get(a)! - index.get(b)!);
    if (children.length === 0) {
      x.set(id, cursor);
      cursor += widthOf(byId.get(id)!) + GAP_X;
    } else {
      const spans = children.map((child) => {
        const childX = place(child);
        return [childX, childX + widthOf(byId.get(child)!)] as const;
      });
      const middle = (Math.min(...spans.map((span) => span[0])) + Math.max(...spans.map((span) => span[1]))) / 2;
      x.set(id, middle - widthOf(byId.get(id)!) / 2);
    }
    return x.get(id)!;
  }

  const roots = ids
    .filter((id) => !ownerOf.has(id))
    .sort((a, b) => rank.get(a)! - rank.get(b)! || index.get(a)! - index.get(b)!);
  for (const root of roots) place(root);
  for (const id of ids) place(id);

  for (const edge of freeFlows.concat(dataflows.filter((flow) => flow.from.nodeId === flow.from.boxId))) {
    if (ownerOf.has(edge.from.boxId) || childrenOf.get(edge.from.boxId)!.length > 0) continue;
    if (rank.get(edge.from.boxId)! >= rank.get(edge.to.boxId)!) continue;
    x.set(
      edge.from.boxId,
      x.get(edge.to.boxId)! + (widthOf(byId.get(edge.to.boxId)!) - widthOf(byId.get(edge.from.boxId)!)) / 2,
    );
  }

  const rows = Array.from({ length: maximumRank + 1 }, (_, row) =>
    ids.filter((id) => rank.get(id) === row).sort((a, b) => x.get(a)! - x.get(b)!),
  );
  const rowWidths = rows.map(
    (rowIds) => rowIds.reduce((total, id) => total + widthOf(byId.get(id)!), 0) + Math.max(0, rowIds.length - 1) * GAP_X,
  );
  const maximumRowWidth = Math.max(...rowWidths);
  for (const [row, rowIds] of rows.entries()) {
    let edge = (maximumRowWidth - rowWidths[row]) / 2;
    for (const id of rowIds) {
      x.set(id, edge);
      edge += widthOf(byId.get(id)!) + GAP_X;
    }
  }

  const minimumX = Math.min(...ids.map((id) => x.get(id)!));
  const boxes = new Map<string, Rect>();
  const memberRects = new Map<string, Rect>();
  const stateRects = new Map<string, Rect>();
  for (const node of nodes) {
    const box = {
      x: x.get(node.id)! - minimumX,
      y: rowTops[rank.get(node.id)!],
      width: widthOf(node),
      height: heightOf(node),
    };
    boxes.set(node.id, box);
    let memberX = box.x + BOX_PADDING;
    if (visibleStateVariables(node).length > 0) {
      const width = stateWidth(node);
      stateRects.set(node.id, {
        x: memberX,
        y: box.y + TAB_HEIGHT,
        width,
        height: stateHeight(node),
      });
      for (const [index, variable] of visibleStateVariables(node).entries()) {
        memberRects.set(variable.id, {
          x: memberX,
          y: box.y + TAB_HEIGHT + 6 + index * STATE_VARIABLE_HEIGHT,
          width,
          height: STATE_VARIABLE_HEIGHT,
        });
      }
      memberX += width + FUNCTION_GAP;
    }
    for (const member of topMembers(node)) {
      const width = memberWidth(member);
      memberRects.set(member.id, {
        x: memberX,
        y: box.y + TAB_HEIGHT,
        width,
        height: FUNCTION_HEIGHT,
      });
      let helperX = memberX + width + FUNCTION_GAP;
      for (const { node: helper } of helperGroups.get(member.id) ?? []) {
        const helperWidth = memberWidth(helper);
        memberRects.set(helper.id, {
          x: helperX,
          y: box.y + TAB_HEIGHT,
          width: helperWidth,
          height: FUNCTION_HEIGHT,
        });
        helperX += helperWidth + FUNCTION_GAP;
      }
      memberX += groupWidth(member) + FUNCTION_GAP;
    }
  }

  const helperFrameRects = new Map<string, Rect>();
  if (!collapsed) {
    for (const [rootId, members] of helperGroups) {
      const rects = [rootId, ...members.map(({ node }) => node.id)].map((id) => memberRects.get(id)!);
      const left = Math.min(...rects.map((rect) => rect.x)) - HELPER_FRAME_PADDING;
      const top = Math.min(...rects.map((rect) => rect.y)) - HELPER_FRAME_PADDING;
      helperFrameRects.set(rootId, {
        x: left,
        y: top,
        width: Math.max(...rects.map((rect) => rect.x + rect.width)) - left + HELPER_FRAME_PADDING,
        height: Math.max(...rects.map((rect) => rect.y + rect.height)) - top + HELPER_FRAME_PADDING,
      });
    }
  }

  return withMissingFunctions({
    boxes,
    memberRects,
    helperFrameRects,
    missingFunctionRects: new Map(),
    stateRects,
    compositionRelationships: composition,
    width: Math.max(320, ...nodes.map((node) => boxes.get(node.id)!.x + boxes.get(node.id)!.width)),
    height: Math.max(240, y - lastRowGap),
  }, missingFunctions);
}
