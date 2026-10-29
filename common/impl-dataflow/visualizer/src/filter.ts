import type { BoundaryNode, FunctionNode, StateVariableNode, StaticDataNode } from "../../types.ts";
import type { ContainerStatus, DataflowNode, GraphContainer, GraphNode, HelperMember, ImplementationDataflow, ResolvedRelationship } from "./types.ts";
import { resolveEndpoint } from "./types.ts";

export type GraphComponent = BoundaryNode & { nodeId: string; uiDirection?: "read" | "write" };

export interface VisibleGraph {
  containers: GraphContainer[];
  components: GraphComponent[];
  staticData: StaticDataNode[];
  missingFunctions: FunctionNode[];
  nodes: GraphNode[];
  relationships: ResolvedRelationship[];
  helperGroups: Map<string, HelperMember[]>;
  expandedHelperGroups: Map<string, HelperMember[]>;
}

export function filterGraph(implementationDataflow: ImplementationDataflow, showUnchanged: boolean, hideInitialization = true, hideHelpers = true, expandedHelpers: ReadonlySet<string> = new Set()): VisibleGraph {
  const filteredNodes = implementationDataflow.nodes.filter((node) => !hideInitialization || !node.initialization);
  const missingFunctions = filteredNodes.filter((node): node is FunctionNode => node.type === "function" && node.subtype === "missing-from-cr");
  const visibleNodes = filteredNodes.filter((node) =>
    (node.type !== "function" || node.subtype !== "missing-from-cr") && (showUnchanged || node.changeType !== "unchanged"),
  );
  const helperGroups = new Map<string, HelperMember[]>();
  const expandedHelperGroups = new Map<string, HelperMember[]>();
  const hiddenHelpers = new Set<string>();
  const collapsedHelpers = new Map<string, string>();
  if (hideHelpers) {
    const functionsById = new Map(implementationDataflow.nodes.filter((node): node is FunctionNode => node.type === "function").map((node) => [node.id, node]));
    const visibleFunctions = new Map(visibleNodes.filter((node): node is FunctionNode => node.type === "function").map((node) => [node.id, node]));
    const membersByRoot = new Map<string, FunctionNode[]>();
    for (const node of visibleFunctions.values()) {
      if (node.helperOf !== undefined) {
        const seen = new Set([node.id]);
        let parentId: string | undefined = node.helperOf;
        while (parentId !== undefined && !seen.has(parentId)) {
          seen.add(parentId);
          const parent: FunctionNode = functionsById.get(parentId)!;
          if (parent.helperOf === undefined) {
            if (visibleFunctions.has(parentId)) {
              const members = membersByRoot.get(parentId) ?? [];
              members.push(node);
              membersByRoot.set(parentId, members);
            } else {
              hiddenHelpers.add(node.id);
            }
            break;
          } else {
            parentId = parent.helperOf;
          }
        }
      }
    }
    for (const [rootId, members] of membersByRoot) {
      const memberIds = new Set(members.map((node) => node.id));
      const children = new Map<string, FunctionNode[]>();
      for (const node of members) {
        let parentId = node.helperOf!;
        while (parentId !== rootId && !memberIds.has(parentId)) parentId = functionsById.get(parentId)!.helperOf!;
        const siblings = children.get(parentId) ?? [];
        siblings.push(node);
        children.set(parentId, siblings);
      }
      const ordered: HelperMember[] = [];
      function visit(parentId: string, depth: number): void {
        for (const node of children.get(parentId) ?? []) {
          ordered.push({ node, parentId, depth });
          visit(node.id, depth + 1);
        }
      }
      visit(rootId, 1);
      helperGroups.set(rootId, ordered);
      if (expandedHelpers.has(rootId)) {
        expandedHelperGroups.set(rootId, ordered);
      } else {
        for (const member of ordered) {
          hiddenHelpers.add(member.node.id);
          collapsedHelpers.set(member.node.id, rootId);
        }
      }
    }
  }
  const graphNodes = visibleNodes.filter((node) => !hiddenHelpers.has(node.id));
  const nodeIds = new Set(graphNodes.map((node) => node.id));
  const containersWithChildren = new Set(implementationDataflow.nodes.flatMap((node) => "containerId" in node && node.containerId !== undefined ? [node.containerId] : []));
  const visibleMemberContainerIds = new Set(graphNodes.flatMap((node) => "containerId" in node && node.containerId !== undefined ? [node.containerId] : []));
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
      hldMismatch: implementationDataflow.nodes.some((node) => node.type === "function" && node.containerId === container.id && node["hld-change-mismatch"] === true),
      functions: graphNodes.filter((node): node is FunctionNode => node.type === "function" && node.containerId === container.id),
      stateVariables: graphNodes.filter((node): node is StateVariableNode => node.type === "state-variable" && node.containerId === container.id),
      staticData: graphNodes.filter((node): node is StaticDataNode => node.type === "static-data" && node.containerId === container.id),
    };
  });
  const visibleContainerIds = new Set(containers.map((container) => container.id));
  const visibleRelationships = implementationDataflow.relationships.filter((relationship) => {
    let visible = false;
    if (relationship.type === "dataflow") {
      const fromId = collapsedHelpers.get(relationship.from.nodeId) ?? relationship.from.nodeId;
      const toId = collapsedHelpers.get(relationship.to.nodeId) ?? relationship.to.nodeId;
      visible = (showUnchanged || relationship.changeType !== "unchanged") && nodeIds.has(fromId) && nodeIds.has(toId)
        && (fromId !== toId || relationship.from.nodeId === relationship.to.nodeId);
    } else if (relationship.type === "composition") {
      visible = visibleContainerIds.has(relationship.from.containerId) && visibleContainerIds.has(relationship.to.containerId);
    }
    return visible;
  });
  const usedIds = new Set([...implementationDataflow.containers, ...implementationDataflow.nodes].map((item) => item.id));
  let nextComponentId = 0;
  const uiWriteIds = new Map<string, string>();
  const components = graphNodes.filter((node): node is BoundaryNode => ["ui-component", "system-input", "system-output", "external-dependency"].includes(node.type)).flatMap((node): GraphComponent[] => {
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
  const staticData = graphNodes.filter((node): node is StaticDataNode => node.type === "static-data");
  const nodes: GraphNode[] = [
    ...containers,
    ...[...components, ...staticData].map((node) => ({ ...node, functions: [], stateVariables: [], staticData: [], nodeType: node.type })),
  ];
  const allNodes = new Map(implementationDataflow.nodes.map((node): [string, DataflowNode] => [node.id, node]));
  const relationships = visibleRelationships.map((relationship) => {
    const from = resolveEndpoint(relationship.from, allNodes);
    const to = resolveEndpoint(relationship.to, allNodes);
    if (from.nodeId !== undefined && collapsedHelpers.has(from.nodeId)) from.nodeId = collapsedHelpers.get(from.nodeId)!;
    if (to.nodeId !== undefined && collapsedHelpers.has(to.nodeId)) to.nodeId = collapsedHelpers.get(to.nodeId)!;
    if (to.type === "ui-component") to.boxId = uiWriteIds.get(to.nodeId!)!;
    return { relationship, from, to };
  });
  return { containers, components, staticData, missingFunctions, nodes, relationships, helperGroups, expandedHelperGroups };
}
