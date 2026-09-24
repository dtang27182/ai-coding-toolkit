import type { ArchitectureDiff, ChangeType, ClassDiff, ComponentDiff, GraphNode, ResolvedEndpoint, ResolvedRelationship } from "./types.ts";
import { methodKey, resolveEndpoint, stateVariableKey } from "./types.ts";

export interface VisibleGraph {
  classes: ClassDiff[];
  components: ComponentDiff[];
  nodes: GraphNode[];
  relationships: ResolvedRelationship[];
  variableExposureCount: number | null;
}

export function filterGraph(diff: ArchitectureDiff, showUnchanged: boolean, userFlowOnly: boolean): VisibleGraph {
  const visible = (entry: { changeType: ChangeType; userFlow?: boolean }) =>
    (showUnchanged || entry.changeType !== "unchanged") && (!userFlowOnly || entry.userFlow === true);
  const classes = diff.classes.filter((classDiff) =>
    (showUnchanged || classDiff.changeType !== "unchanged") &&
    (!userFlowOnly || classDiff.stateVariables.some((stateVariable) => stateVariable.userFlow === true) || classDiff.methods.some((method) => method.userFlow === true) || diff.relationships.some(
      (relationship) => relationship.type === "dataflow" && relationship.userFlow === true &&
        (("class" in relationship.from && relationship.from.class === classDiff.name) ||
          ("class" in relationship.to && relationship.to.class === classDiff.name)),
    )),
  ).map((classDiff) => {
    const methods = classDiff.methods.filter(visible);
    const variableExposure = classDiff.variableExposure === undefined || classDiff.variableExposure === null ? null : classDiff.variableExposure.filter(
      (variable) => variable.kind === "instance" || methods.some((method) => method.name === variable.method),
    );
    return {
      ...classDiff,
      methods,
      variableExposure,
      variableExposureCount: variableExposure === null ? null : variableExposure.length,
    };
  });
  const components = diff.components.filter(visible);
  const nodes: GraphNode[] = [
    ...classes.map((classDiff) => ({
      name: classDiff.name,
      changeType: classDiff.changeType,
      methods: classDiff.methods,
      stateVariables: classDiff.stateVariables,
    })),
    ...components.map((component) => ({
      name: component.name,
      changeType: component.changeType,
      methods: [],
      stateVariables: [],
      componentType: component.type,
    })),
  ];
  const classNames = new Set(classes.map((classDiff) => classDiff.name));
  const componentNames = new Set(components.map((component) => component.name));
  const methodNames = new Set(classes.flatMap((classDiff) => classDiff.methods.map((method) => methodKey(classDiff.name, method.name))));
  const stateVariableNames = new Set(classes.flatMap((classDiff) => classDiff.stateVariables.map((stateVariable) => stateVariableKey(classDiff.name, stateVariable.name))));
  const endpointVisible = (endpoint: ResolvedEndpoint) => {
    if (endpoint.component) {
      return componentNames.has(endpoint.nodeName);
    } else if (endpoint.methodName !== undefined) {
      return classNames.has(endpoint.nodeName) && methodNames.has(methodKey(endpoint.nodeName, endpoint.methodName));
    } else if (endpoint.stateVariableName !== undefined) {
      return classNames.has(endpoint.nodeName) && stateVariableNames.has(stateVariableKey(endpoint.nodeName, endpoint.stateVariableName));
    } else {
      return classNames.has(endpoint.nodeName);
    }
  };
  const relationships = diff.relationships.filter((relationship) => relationship.type === "composition" || visible(relationship)).map((relationship) => ({
    relationship,
    from: resolveEndpoint(relationship.from),
    to: resolveEndpoint(relationship.to),
  })).filter((relationship) => endpointVisible(relationship.from) && endpointVisible(relationship.to));
  const variableExposureCount = classes.some((classDiff) => classDiff.variableExposure === null) ? null : new Set(
    classes.flatMap((classDiff) => classDiff.variableExposure!.map((variable) =>
      JSON.stringify([variable.declaredAt.file, variable.declaredAt.line, variable.declaredAt.column]),
    )),
  ).size;
  return { classes, components, nodes, relationships, variableExposureCount };
}
