import { boxCollapsed, edgeKey, visibleEndpointId, type CollapsedContainers, type ResolvedRelationship } from "./types.ts";

export interface DrawnEdge {
  key: string;
  forward: ResolvedRelationship;
  back?: ResolvedRelationship;
  relationships: ResolvedRelationship[];
}

/** Pair opposite flows at visible endpoints, then collapse all flows between each visible pair. */
export function dataflowEdges(relationships: ResolvedRelationship[], collapsed: CollapsedContainers): DrawnEdge[] {
  const drawable = relationships.filter((item) => item.relationship.type === "dataflow" &&
    (!boxCollapsed(item.from.boxId, collapsed) || item.from.boxId !== item.to.boxId));
  const used = new Set<ResolvedRelationship>();
  const edges: DrawnEdge[] = [];
  const merged = new Map<string, DrawnEdge>();
  for (const item of drawable) {
    if (!used.has(item)) {
      const { relationship, from, to } = item;
      let forward = item;
      let back: ResolvedRelationship | undefined;
      const opposite = drawable.find((candidate) => candidate !== item && !used.has(candidate)
        && visibleEndpointId(candidate.from, collapsed) === visibleEndpointId(to, collapsed)
        && visibleEndpointId(candidate.to, collapsed) === visibleEndpointId(from, collapsed));
      if (opposite !== undefined) {
        if ((relationship.type === "dataflow" && relationship.transferType === "return"
          && opposite.relationship.type === "dataflow" && opposite.relationship.transferType === "arguments")
          || (from.type === "state-variable" && to.type === "function")) {
          forward = opposite;
          back = item;
        } else {
          back = opposite;
        }
      }
      const members = back === undefined ? [forward] : [forward, back];
      for (const member of members) used.add(member);
      const merge = boxCollapsed(from.boxId, collapsed) || boxCollapsed(to.boxId, collapsed);
      const key = merge ? JSON.stringify(["dataflow", ...[visibleEndpointId(from, collapsed), visibleEndpointId(to, collapsed)].sort()]) : JSON.stringify([edgeKey(forward, collapsed), forward.relationship.changeType,
        forward.relationship.type === "dataflow" ? forward.relationship.transferType : undefined, back?.relationship.changeType]);
      const existing = merge ? merged.get(key) : undefined;
      if (existing === undefined) {
        const edge = { key, forward, back, relationships: members };
        edges.push(edge);
        merged.set(key, edge);
      } else if (existing !== undefined) {
        existing.relationships.push(...members);
        if (existing.back === undefined) {
          existing.back = members.find((member) => visibleEndpointId(member.from, collapsed) === visibleEndpointId(existing.forward.to, collapsed));
        }
      }
    }
  }
  return edges;
}

export function relationshipsForEdge(relationships: ResolvedRelationship[], edge: string, collapsed: CollapsedContainers): ResolvedRelationship[] {
  return [
    ...relationships.filter((item) => item.relationship.type === "composition" && edgeKey(item, collapsed) === edge),
    ...dataflowEdges(relationships, collapsed).filter((item) => item.key === edge).flatMap((item) => item.relationships),
  ];
}
