import type { BoundaryNode, FunctionNode, StateVariableNode, StaticDataNode } from "../../types.ts";
import type { ContainerStatus, DataflowNode, GraphContainer, GraphNode, ImplementationDataflow, ResolvedRelationship } from "./types.ts";
import { resolveEndpoint } from "./types.ts";

export type GraphComponent = BoundaryNode & { nodeId: string; uiDirection?: "read" | "write" };

export interface VisibleGraph {
  containers: GraphContainer[];
  components: GraphComponent[];
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
    const children = implementationDataflow.nodes.filter((node) => "containerId" in node && node.containerId === container.id && (node.type !== "function" || node.subtype !== "missing-from-cr"));
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
  const visibleContainerIds = new Set(containers.map((container) => container.id));
  const visibleRelationships = implementationDataflow.relationships.filter((relationship) => {
    let visible = false;
    if (relationship.type === "dataflow") {
      visible = (showUnchanged || relationship.changeType !== "unchanged") && nodeIds.has(relationship.from.nodeId) && nodeIds.has(relationship.to.nodeId);
    } else if (relationship.type === "composition") {
      visible = visibleContainerIds.has(relationship.from.containerId) && visibleContainerIds.has(relationship.to.containerId);
    }
    return visible;
  });
  const usedIds = new Set([...implementationDataflow.containers, ...implementationDataflow.nodes].map((item) => item.id));
  let nextComponentId = 0;
  const uiWriteIds = new Map<string, string>();
  const components = visibleNodes.filter((node): node is BoundaryNode => ["ui-component", "system-input", "system-output", "external-dependency"].includes(node.type)).flatMap((node): GraphComponent[] => {
    if (node.type === "ui-component") {
      const icons: GraphComponent[] = [];
      if (visibleRelationships.some((relationship) => relationship.type === "dataflow" && relationship.from.nodeId === node.id)) {
        icons.push({ ...node, nodeId: node.id, uiDirection: "read" });
      }
      if (visibleRelationships.some((relationship) => relationship.type === "dataflow" && relationship.to.nodeId === node.id)) {
        let writeId: string;
        do {
          writeId = `ui-write-${nextComponentId++}`;
        } while (usedIds.has(writeId));
        usedIds.add(writeId);
        uiWriteIds.set(node.id, writeId);
        icons.push({ ...node, id: writeId, nodeId: node.id, uiDirection: "write" });
      }
      return icons;
    } else {
      return [{ ...node, nodeId: node.id }];
    }
  });
  const staticData = visibleNodes.filter((node): node is StaticDataNode => node.type === "static-data");
  const nodes: GraphNode[] = [
    ...containers,
    ...[...components, ...staticData].map((node) => ({ ...node, functions: [], stateVariables: [], staticData: [], nodeType: node.type })),
  ];
  const allNodes = new Map(implementationDataflow.nodes.map((node): [string, DataflowNode] => [node.id, node]));
  const relationships = visibleRelationships.map((relationship) => {
    const from = resolveEndpoint(relationship.from, allNodes);
    const to = resolveEndpoint(relationship.to, allNodes);
    if (to.type === "ui-component") to.boxId = uiWriteIds.get(to.nodeId!)!;
    return { relationship, from, to };
  });
  return { containers, components, staticData, nodes, relationships };
}
