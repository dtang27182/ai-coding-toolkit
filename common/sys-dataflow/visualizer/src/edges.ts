import type { SystemDataflowRelationship } from "./types.ts";

export interface DrawnEdge {
  forward: SystemDataflowRelationship;
  back?: SystemDataflowRelationship;
  relationships: SystemDataflowRelationship[];
}

export function dataflowEdges(relationships: SystemDataflowRelationship[]): DrawnEdge[] {
  const used = new Set<SystemDataflowRelationship>();
  const edges: DrawnEdge[] = [];
  for (const relationship of relationships) {
    if (!used.has(relationship)) {
      const back = relationships.find((candidate) => relationship.from !== relationship.to && candidate !== relationship && !used.has(candidate)
        && candidate.from === relationship.to && candidate.to === relationship.from);
      const members = back === undefined ? [relationship] : [relationship, back];
      for (const member of members) used.add(member);
      edges.push({ forward: relationship, back, relationships: members });
    }
  }
  return edges;
}

export function relationshipsForEdge(relationships: SystemDataflowRelationship[], id: string): SystemDataflowRelationship[] {
  return dataflowEdges(relationships).find((edge) => edge.relationships.some((relationship) => relationship.id === id))?.relationships ?? [];
}
