import type { ArchitectureDiff } from "./types.ts";
import { resolveEndpoint } from "./types.ts";

export function semanticError(value: ArchitectureDiff): string | undefined {
  const names = [...value.classes.map((classDiff) => classDiff.name), ...value.components.map((component) => component.name)];
  if (new Set(names).size !== names.length) {
    return "Class and component names must be unique.";
  }
  const classes = new Map(value.classes.map((classDiff) => [classDiff.name, classDiff]));
  const components = new Map(value.components.map((component) => [component.name, component]));
  for (const classDiff of value.classes) {
    if (new Set(classDiff.methods.map((method) => method.name)).size !== classDiff.methods.length) {
      return `Method names in “${classDiff.name}” must be unique.`;
    }
  }
  for (const relationship of value.relationships) {
    for (const endpoint of [relationship.from, relationship.to]) {
      const resolved = resolveEndpoint(endpoint);
      if (resolved.component && !components.has(resolved.nodeName)) {
        return `Relationship references unknown component “${resolved.nodeName}”.`;
      } else if (!resolved.component && !classes.has(resolved.nodeName)) {
        return `Relationship references unknown class “${resolved.nodeName}”.`;
      } else if (!resolved.component && resolved.methodName !== undefined && !classes.get(resolved.nodeName)!.methods.some((method) => method.name === resolved.methodName)) {
        return `Relationship references unknown method “${resolved.nodeName}.${resolved.methodName}”.`;
      } else if (relationship.userFlow && resolved.component && !components.get(resolved.nodeName)!.userFlow) {
        return `User-flow relationship references a supporting component: ${resolved.nodeName}`;
      } else if (relationship.userFlow && !resolved.component && resolved.methodName !== undefined && !classes.get(resolved.nodeName)!.methods.find((method) => method.name === resolved.methodName)!.userFlow) {
        return `User-flow relationship references a supporting method: ${resolved.nodeName}.${resolved.methodName}`;
      } else if (relationship.type === "state-update" && relationship.userFlow && !resolved.component && resolved.methodName === undefined && !classes.get(resolved.nodeName)!.hasUserFlowState) {
        return `User-flow state update targets a class without user-flow state: ${resolved.nodeName}`;
      }
    }
  }
  return undefined;
}
