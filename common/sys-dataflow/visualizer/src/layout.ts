import type { GraphLayout, Rect, SystemDataflowNode, SystemDataflowRelationship } from "./types.ts";

const NODE_WIDTH = 248;
const NODE_HEIGHT = 92;
const GAP_X = 72;
const GAP_Y = 116;
const PADDING = 26;

function acyclicRelationships(nodes: SystemDataflowNode[], relationships: SystemDataflowRelationship[]): SystemDataflowRelationship[] {
  const kept: SystemDataflowRelationship[] = [];
  const adjacency = new Map(nodes.map((node) => [node.name, [] as string[]]));

  function createsCycle(from: string, to: string): boolean {
    const visited = new Set<string>();
    const pending = [to];
    let cycle = false;
    while (pending.length > 0 && !cycle) {
      const current = pending.pop()!;
      if (current === from) {
        cycle = true;
      } else if (!visited.has(current)) {
        visited.add(current);
        pending.push(...(adjacency.get(current) ?? []));
      }
    }
    return cycle;
  }

  for (const relationship of relationships) {
    if (relationship.from !== relationship.to && !createsCycle(relationship.from, relationship.to)) {
      adjacency.get(relationship.from)?.push(relationship.to);
      kept.push(relationship);
    }
  }
  return kept;
}

export function computeLayout(nodes: SystemDataflowNode[], relationships: SystemDataflowRelationship[]): GraphLayout {
  if (nodes.length === 0) {
    return { boxes: new Map(), width: 320, height: 240 };
  }

  const order = new Map(nodes.map((node, index) => [node.name, index]));
  const rank = new Map(nodes.map((node) => [node.name, 0]));
  const layoutRelationships = acyclicRelationships(nodes, relationships);
  for (let pass = 0; pass < nodes.length; pass += 1) {
    let moved = false;
    for (const relationship of layoutRelationships) {
      const nextRank = rank.get(relationship.from)! + 1;
      if (rank.get(relationship.to)! < nextRank) {
        rank.set(relationship.to, nextRank);
        moved = true;
      }
    }
    if (!moved) break;
  }

  const maximumRank = Math.max(...rank.values());
  const rows = Array.from({ length: maximumRank + 1 }, (_, row) =>
    nodes.filter((node) => rank.get(node.name) === row).sort((left, right) => order.get(left.name)! - order.get(right.name)!),
  );
  const maximumColumns = Math.max(...rows.map((row) => row.length));
  const contentWidth = maximumColumns * NODE_WIDTH + Math.max(0, maximumColumns - 1) * GAP_X;
  const boxes = new Map<string, Rect>();
  for (const [rowIndex, row] of rows.entries()) {
    const rowWidth = row.length * NODE_WIDTH + Math.max(0, row.length - 1) * GAP_X;
    let x = PADDING + (contentWidth - rowWidth) / 2;
    const y = PADDING + rowIndex * (NODE_HEIGHT + GAP_Y);
    for (const node of row) {
      boxes.set(node.name, { x, y, width: NODE_WIDTH, height: NODE_HEIGHT });
      x += NODE_WIDTH + GAP_X;
    }
  }

  return {
    boxes,
    width: contentWidth + PADDING * 2,
    height: PADDING * 2 + (maximumRank + 1) * NODE_HEIGHT + maximumRank * GAP_Y,
  };
}
