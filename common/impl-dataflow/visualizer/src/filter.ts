import type { BoundaryNode, FunctionNode, StateVariableNode, StaticDataNode } from "../../types.ts";
import type { ContainerStatus, DataflowNode, GraphContainer, GraphNode, ImplementationDataflow, ResolvedRelationship } from "./types.ts";
import { resolveEndpoint } from "./types.ts";

export interface VisibleGraph {
  containers: GraphContainer[];
  components: BoundaryNode[];
  staticData: StaticDataNode[];
  nodes: GraphNode[];
  relationships: ResolvedRelationship[];
}

export function filterGraph(implementationDataflow: ImplementationDataflow, showUnchanged: boolean, hideInitialization = true): VisibleGraph {
  const filteredNodes = implementationDataflow.nodes.filter((node) => !hideInitialization || !node.initialization);
  const visibleNodes = filteredNodes.filter((node) => showUnchanged || node.changeType !== "unchanged");
  const nodeIds = new Set(visibleNodes.map((node) => node.id));
  const containersWithChildren = new Set(implementationDataflow.nodes.flatMap((node) => "containerId" in node && node.containerId !== undefined ? [node.containerId] : []));
  const visibleMemberContainerIds = new Set(visibleNodes.flatMap((node) => "containerId" in node && node.containerId !== undefined ? [node.containerId] : []));
  const containerIds = new Set(visibleMemberContainerIds);
  for (const relationship of implementationDataflow.relationships) {
    if (relationship.type === "composition" && (showUnchanged || relationship.changeType !== "unchanged")) {
      containerIds.add(relationship.from.containerId);
      containerIds.add(relationship.to.containerId);
    }
  }
  const containers: GraphContainer[] = implementationDataflow.containers.filter((container) =>
    (!containersWithChildren.has(container.id) || visibleMemberContainerIds.has(container.id)) && (showUnchanged || containerIds.has(container.id)),
  ).map((container) => {
    const children = implementationDataflow.nodes.filter((node) => "containerId" in node && node.containerId === container.id);
    let changeType: ContainerStatus;
    if (children.length === 0 || children.every((node) => node.changeType === "unchanged")) {
      changeType = "unchanged";
    } else if (children.every((node) => node.changeType === "added")) {
      changeType = "new";
    } else if (children.every((node) => node.changeType === "deleted")) {
      changeType = "deleted";
    } else {
      changeType = "changed";
    }
    return {
      ...container,
      changeType,
      functions: visibleNodes.filter((node): node is FunctionNode => node.type === "function" && node.containerId === container.id),
      stateVariables: visibleNodes.filter((node): node is StateVariableNode => node.type === "state-variable" && node.containerId === container.id),
      staticData: visibleNodes.filter((node): node is StaticDataNode => node.type === "static-data" && node.containerId === container.id),
    };
  });
  const components = visibleNodes.filter((node): node is BoundaryNode => ["ui-component", "system-input", "system-output", "external-dependency"].includes(node.type));
  const staticData = visibleNodes.filter((node): node is StaticDataNode => node.type === "static-data" && node.containerId === undefined);
  const nodes: GraphNode[] = [
    ...containers,
    ...[...components, ...staticData].map((node) => ({ ...node, functions: [], stateVariables: [], staticData: [], nodeType: node.type })),
  ];
  const visibleContainerIds = new Set(containers.map((container) => container.id));
  const allNodes = new Map(implementationDataflow.nodes.map((node): [string, DataflowNode] => [node.id, node]));
  const relationships = implementationDataflow.relationships.filter((relationship) => {
    let visible = false;
    if (relationship.type === "dataflow") {
      visible = (showUnchanged || relationship.changeType !== "unchanged") && nodeIds.has(relationship.from.nodeId) && nodeIds.has(relationship.to.nodeId);
    } else if (relationship.type === "composition") {
      visible = visibleContainerIds.has(relationship.from.containerId) && visibleContainerIds.has(relationship.to.containerId);
    }
    return visible;
  }).map((relationship) => ({ relationship, from: resolveEndpoint(relationship.from, allNodes), to: resolveEndpoint(relationship.to, allNodes) }));
  return { containers, components, staticData, nodes, relationships };
}
