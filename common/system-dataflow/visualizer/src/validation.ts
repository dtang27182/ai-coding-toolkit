import type { NodeType, SystemDataflow } from "./types.ts";

const NODE_DIRECTIONS: Record<NodeType, { incoming: boolean; outgoing: boolean }> = {
  "user-input": { incoming: false, outgoing: true },
  "user-output": { incoming: true, outgoing: false },
  "external-dependency": { incoming: true, outgoing: true },
  "system-input": { incoming: false, outgoing: true },
  "system-output": { incoming: true, outgoing: false },
  "system-state": { incoming: true, outgoing: true },
  "static-data": { incoming: false, outgoing: true },
  "data-processing": { incoming: true, outgoing: true },
};

export function semanticError(value: SystemDataflow): string | undefined {
  const names = value.nodes.map((node) => node.name);
  const relationshipIds = value.relationships.map((relationship) => relationship.id);
  let error: string | undefined;
  if (new Set(names).size !== names.length) {
    error = "Node names must be unique.";
  } else if (new Set(relationshipIds).size !== relationshipIds.length) {
    error = "Relationship IDs must be unique.";
  } else {
    const nodesByName = new Map(value.nodes.map((node) => [node.name, node]));
    for (const relationship of value.relationships) {
      const source = nodesByName.get(relationship.from);
      const destination = nodesByName.get(relationship.to);
      if (source === undefined) {
        error = `Relationship “${relationship.id}” references unknown source node “${relationship.from}”.`;
        break;
      } else if (destination === undefined) {
        error = `Relationship “${relationship.id}” references unknown destination node “${relationship.to}”.`;
        break;
      } else if (!NODE_DIRECTIONS[source.type].outgoing) {
        error = `Relationship “${relationship.id}” cannot leave ${source.type} node “${source.name}”.`;
        break;
      } else if (!NODE_DIRECTIONS[destination.type].incoming) {
        error = `Relationship “${relationship.id}” cannot enter ${destination.type} node “${destination.name}”.`;
        break;
      }
    }
  }
  return error;
}
