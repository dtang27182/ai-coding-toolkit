import type { SystemDataflow } from "./types.ts";

export function semanticError(value: SystemDataflow): string | undefined {
  const names = value.nodes.map((node) => node.name);
  const relationshipIds = value.relationships.map((relationship) => relationship.id);
  let error: string | undefined;
  if (new Set(names).size !== names.length) {
    error = "Node names must be unique.";
  } else if (new Set(relationshipIds).size !== relationshipIds.length) {
    error = "Relationship IDs must be unique.";
  } else {
    const knownNames = new Set(names);
    for (const relationship of value.relationships) {
      if (!knownNames.has(relationship.from)) {
        error = `Relationship “${relationship.id}” references unknown source node “${relationship.from}”.`;
        break;
      } else if (!knownNames.has(relationship.to)) {
        error = `Relationship “${relationship.id}” references unknown destination node “${relationship.to}”.`;
        break;
      }
    }
  }
  return error;
}
