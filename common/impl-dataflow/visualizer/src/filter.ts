import type { ChangeType, ComponentDiff, GraphContainerDiff, GraphNode, ImplementationDataflow, ResolvedEndpoint, ResolvedRelationship, StaticDataDiff } from "./types.ts";
import { functionKey, resolveEndpoint, stateVariableKey } from "./types.ts";

export interface VisibleGraph {
  classes: GraphContainerDiff[];
  components: ComponentDiff[];
  staticData: StaticDataDiff[];
  nodes: GraphNode[];
  relationships: ResolvedRelationship[];
  variableExposureCount: number | null;
}

export function filterGraph(implementationDataflow: ImplementationDataflow, showUnchanged: boolean, userFlowOnly: boolean): VisibleGraph {
  const visible = (entry: { changeType: ChangeType; userFlow?: boolean }) =>
    (showUnchanged || entry.changeType !== "unchanged") && (!userFlowOnly || entry.userFlow === true);
  const classes: GraphContainerDiff[] = implementationDataflow.classes.filter((classDiff) =>
    (showUnchanged || classDiff.changeType !== "unchanged") &&
    (!userFlowOnly || classDiff.stateVariables.some((stateVariable) => stateVariable.userFlow === true) || classDiff.functions.some((functionDiff) => functionDiff.userFlow === true) || implementationDataflow.relationships.some(
      (relationship) => relationship.type === "dataflow" && relationship.userFlow === true &&
        (("class" in relationship.from && relationship.from.class === classDiff.name) ||
          ("class" in relationship.to && relationship.to.class === classDiff.name)),
    )),
  ).map((classDiff) => {
    const functions = classDiff.functions.filter(visible);
    const variableExposure = classDiff.variableExposure === undefined || classDiff.variableExposure === null ? null : classDiff.variableExposure.filter(
      (variable) => variable.kind === "instance" || functions.some((functionDiff) => functionDiff.name === variable.function),
    );
    return {
      ...classDiff,
      functions,
      variableExposure,
      variableExposureCount: variableExposure === null ? null : variableExposure.length,
    };
  });
  classes.push(...(implementationDataflow.modules ?? []).filter((moduleDiff) =>
    (showUnchanged || moduleDiff.changeType !== "unchanged") &&
    (!userFlowOnly || moduleDiff.functions.some((functionDiff) => functionDiff.userFlow === true)),
  ).map((moduleDiff) => ({
    ...moduleDiff,
    functions: moduleDiff.functions.filter(visible),
    stateVariables: [],
    containerType: "module" as const,
  })));
  const components = implementationDataflow.components.filter(visible);
  const staticData = implementationDataflow.staticData.filter(visible);
  const nodes: GraphNode[] = [
    ...classes.map((classDiff) => ({
      name: classDiff.name,
      changeType: classDiff.changeType,
      functions: classDiff.functions,
      stateVariables: classDiff.stateVariables,
    })),
    ...components.map((component) => ({
      name: component.name,
      changeType: component.changeType,
      functions: [],
      stateVariables: [],
      nodeType: component.type,
    })),
    ...staticData.map((entry) => ({
      name: entry.name,
      changeType: entry.changeType,
      functions: [],
      stateVariables: [],
      nodeType: "static-data" as const,
    })),
  ];
  const classNames = new Set(classes.map((classDiff) => classDiff.name));
  const componentNames = new Set(components.map((component) => component.name));
  const staticDataNames = new Set(staticData.map((entry) => entry.name));
  const functionNames = new Set(classes.flatMap((classDiff) => classDiff.functions.map((functionDiff) => functionKey(classDiff.name, functionDiff.name))));
  const stateVariableNames = new Set(classes.flatMap((classDiff) => classDiff.stateVariables.map((stateVariable) => stateVariableKey(classDiff.name, stateVariable.name))));
  const endpointVisible = (endpoint: ResolvedEndpoint) => {
    if (endpoint.staticData) {
      return staticDataNames.has(endpoint.nodeName);
    } else if (endpoint.component) {
      return componentNames.has(endpoint.nodeName);
    } else if (endpoint.functionName !== undefined) {
      return classNames.has(endpoint.nodeName) && functionNames.has(functionKey(endpoint.nodeName, endpoint.functionName));
    } else if (endpoint.stateVariableName !== undefined) {
      return classNames.has(endpoint.nodeName) && stateVariableNames.has(stateVariableKey(endpoint.nodeName, endpoint.stateVariableName));
    } else {
      return classNames.has(endpoint.nodeName);
    }
  };
  const relationships = implementationDataflow.relationships.filter((relationship) => relationship.type === "composition" || visible(relationship)).map((relationship) => ({
    relationship,
    from: resolveEndpoint(relationship.from),
    to: resolveEndpoint(relationship.to),
  })).filter((relationship) => endpointVisible(relationship.from) && endpointVisible(relationship.to));
  const exposureClasses = classes.filter((classDiff) => classDiff.containerType !== "module");
  const variableExposureCount = exposureClasses.some((classDiff) => classDiff.variableExposure === undefined || classDiff.variableExposure === null) ? null : new Set(
    exposureClasses.flatMap((classDiff) => classDiff.variableExposure!.map((variable) =>
      JSON.stringify([variable.declaredAt.file, variable.declaredAt.line, variable.declaredAt.column]),
    )),
  ).size;
  return { classes, components, staticData, nodes, relationships, variableExposureCount };
}
