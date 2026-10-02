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
  const subgraphIds = value.subgraphs.map((subgraph) => subgraph.id);
  const names = value.subgraphs.flatMap((subgraph) => subgraph.nodes.map((node) => node.name));
  const relationshipIds = value.subgraphs.flatMap((subgraph) => subgraph.relationships.map((relationship) => relationship.id));
  let error: string | undefined;
  if (new Set(subgraphIds).size !== subgraphIds.length) {
    error = "Subgraph IDs must be unique.";
  } else if (new Set(names).size !== names.length) {
    error = "Node names must be unique.";
  } else if (new Set(relationshipIds).size !== relationshipIds.length) {
    error = "Relationship IDs must be unique.";
  } else {
    for (const subgraph of value.subgraphs) {
      const nodesByName = new Map(subgraph.nodes.map((node) => [node.name, node]));
      for (const relationship of subgraph.relationships) {
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
      if (error !== undefined) break;
    }
  }
  return error;
}
