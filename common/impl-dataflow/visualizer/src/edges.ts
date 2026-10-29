import { edgeKey, type ResolvedRelationship } from "./types.ts";

export interface DrawnEdge {
  key: string;
  forward: ResolvedRelationship;
  back?: ResolvedRelationship;
  relationships: ResolvedRelationship[];
}

/** Pair opposite flows at node IDs, then collapse all flows between each visible pair. */
export function dataflowEdges(relationships: ResolvedRelationship[], collapsed: boolean): DrawnEdge[] {
  const drawable = relationships.filter((item) => item.relationship.type === "dataflow" && (!collapsed || item.from.boxId !== item.to.boxId));
  const used = new Set<ResolvedRelationship>();
  const edges: DrawnEdge[] = [];
  const merged = new Map<string, DrawnEdge>();
  for (const item of drawable) {
    if (!used.has(item)) {
      const { relationship, from, to } = item;
      let forward = item;
      let back: ResolvedRelationship | undefined;
      if (relationship.type === "dataflow" && from.type === "function" && to.type === "function") {
        const opposite = drawable.find((candidate) => candidate !== item && !used.has(candidate)
          && candidate.relationship.type === "dataflow" && candidate.from.type === "function" && candidate.to.type === "function"
          && candidate.from.nodeId === to.nodeId && candidate.to.nodeId === from.nodeId
          && ((relationship.transferType === "arguments" && candidate.relationship.transferType === "return")
            || (relationship.transferType === "return" && candidate.relationship.transferType === "arguments")));
        if (opposite !== undefined) {
          if (relationship.transferType === "arguments") {
            back = opposite;
          } else if (relationship.transferType === "return") {
            forward = opposite;
            back = item;
          }
        }
      } else if (relationship.type === "dataflow" && ((from.type === "function" && to.type === "state-variable") || (from.type === "state-variable" && to.type === "function"))) {
        const opposite = drawable.find((candidate) => candidate !== item && !used.has(candidate)
          && candidate.relationship.type === "dataflow" && candidate.from.type === to.type && candidate.to.type === from.type
          && candidate.from.nodeId === to.nodeId && candidate.to.nodeId === from.nodeId);
        if (opposite !== undefined) {
          if (from.type === "function") {
            back = opposite;
          } else if (from.type === "state-variable") {
            forward = opposite;
            back = item;
          }
        }
      }
      const members = back === undefined ? [forward] : [forward, back];
      for (const member of members) used.add(member);
      const key = collapsed ? JSON.stringify(["dataflow", ...[from.boxId, to.boxId].sort()]) : JSON.stringify([edgeKey(forward, collapsed), forward.relationship.changeType,
        forward.relationship.type === "dataflow" ? forward.relationship.transferType : undefined, back?.relationship.changeType]);
      const existing = collapsed ? merged.get(key) : undefined;
      if (existing === undefined) {
        const edge = { key, forward, back, relationships: members };
        edges.push(edge);
        merged.set(key, edge);
      } else if (existing !== undefined) {
        existing.relationships.push(...members);
        if (existing.back === undefined) {
          existing.back = members.find((member) => member.from.boxId === existing.forward.to.boxId);
        }
      }
    }
  }
  return edges;
}

export function relationshipsForEdge(relationships: ResolvedRelationship[], edge: string, collapsed: boolean): ResolvedRelationship[] {
  return [
    ...relationships.filter((item) => item.relationship.type === "composition" && edgeKey(item, collapsed) === edge),
    ...dataflowEdges(relationships, collapsed).filter((item) => item.key === edge).flatMap((item) => item.relationships),
  ];
}
