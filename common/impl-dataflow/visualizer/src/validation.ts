import type { ImplementationDataflow } from "./types.ts";
import { resolveEndpoint } from "./types.ts";

export function semanticError(value: ImplementationDataflow): string | undefined {
  const names = [...value.classes.map((classDiff) => classDiff.name), ...(value.modules ?? []).map((moduleDiff) => moduleDiff.name), ...value.components.map((component) => component.name), ...value.staticData.map((entry) => entry.name)];
  if (new Set(names).size !== names.length) {
    return "Class, module, component, and static-data names must be unique.";
  }
  const classes = new Map(value.classes.map((classDiff) => [classDiff.name, classDiff]));
  const modules = new Map((value.modules ?? []).map((moduleDiff) => [moduleDiff.name, moduleDiff]));
  const components = new Map(value.components.map((component) => [component.name, component]));
  const staticData = new Map(value.staticData.map((entry) => [entry.name, entry]));
  for (const classDiff of value.classes) {
    if (new Set(classDiff.functions.map((functionDiff) => functionDiff.name)).size !== classDiff.functions.length) {
      return `Function names in “${classDiff.name}” must be unique.`;
    }
    if (new Set(classDiff.stateVariables.map((stateVariable) => stateVariable.name)).size !== classDiff.stateVariables.length) {
      return `State variable names in “${classDiff.name}” must be unique.`;
    }
  }
  for (const moduleDiff of value.modules ?? []) {
    if (new Set(moduleDiff.functions.map((functionDiff) => functionDiff.name)).size !== moduleDiff.functions.length) {
      return `Function names in “${moduleDiff.name}” must be unique.`;
    }
  }
  for (const relationship of value.relationships) {
    for (const endpoint of [relationship.from, relationship.to]) {
      const resolved = resolveEndpoint(endpoint);
      if (resolved.staticData) {
        if (!staticData.has(resolved.nodeName)) {
          return `Relationship references unknown static data “${resolved.nodeName}”.`;
        } else if (relationship.userFlow && !staticData.get(resolved.nodeName)!.userFlow) {
          return `User-flow relationship references supporting static data: ${resolved.nodeName}`;
        }
      } else if (resolved.component && !components.has(resolved.nodeName)) {
        return `Relationship references unknown component “${resolved.nodeName}”.`;
      } else if (resolved.component && endpoint === relationship.from && components.get(resolved.nodeName)!.type === "system-output") {
        return `System-output component cannot send data: ${resolved.nodeName}`;
      } else if (resolved.component && endpoint === relationship.to && components.get(resolved.nodeName)!.type === "system-input") {
        return `System-input component cannot receive data: ${resolved.nodeName}`;
      } else if (resolved.module && !modules.has(resolved.nodeName)) {
        return `Relationship references unknown module “${resolved.nodeName}”.`;
      } else if (resolved.module && !modules.get(resolved.nodeName)!.functions.some((functionDiff) => functionDiff.name === resolved.functionName)) {
        return `Relationship references unknown function “${resolved.nodeName}.${resolved.functionName}”.`;
      } else if (!resolved.module && !resolved.component && !classes.has(resolved.nodeName)) {
        return `Relationship references unknown class “${resolved.nodeName}”.`;
      } else if (!resolved.module && !resolved.component && resolved.functionName !== undefined && !classes.get(resolved.nodeName)!.functions.some((functionDiff) => functionDiff.name === resolved.functionName)) {
        return `Relationship references unknown function “${resolved.nodeName}.${resolved.functionName}”.`;
      } else if (!resolved.module && !resolved.component && resolved.stateVariableName !== undefined && !classes.get(resolved.nodeName)!.stateVariables.some((stateVariable) => stateVariable.name === resolved.stateVariableName)) {
        return `Relationship references unknown state variable “${resolved.nodeName}.${resolved.stateVariableName}”.`;
      } else if (relationship.userFlow && resolved.component && !components.get(resolved.nodeName)!.userFlow) {
        return `User-flow relationship references a supporting component: ${resolved.nodeName}`;
      } else if (relationship.userFlow && resolved.module && !modules.get(resolved.nodeName)!.functions.find((functionDiff) => functionDiff.name === resolved.functionName)!.userFlow) {
        return `User-flow relationship references a supporting function: ${resolved.nodeName}.${resolved.functionName}`;
      } else if (relationship.userFlow && !resolved.module && !resolved.component && resolved.functionName !== undefined && !classes.get(resolved.nodeName)!.functions.find((functionDiff) => functionDiff.name === resolved.functionName)!.userFlow) {
        return `User-flow relationship references a supporting function: ${resolved.nodeName}.${resolved.functionName}`;
      } else if (relationship.userFlow && !resolved.module && !resolved.component && resolved.stateVariableName !== undefined && !classes.get(resolved.nodeName)!.stateVariables.find((stateVariable) => stateVariable.name === resolved.stateVariableName)!.userFlow) {
        return `User-flow relationship references a supporting state variable: ${resolved.nodeName}.${resolved.stateVariableName}`;
      }
    }
  }
  return undefined;
}
