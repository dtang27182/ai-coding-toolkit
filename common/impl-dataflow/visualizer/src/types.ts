import type { ChangeType, ComponentType, Container, ContainerType, DataflowNode, FunctionNode, NodeType, Relationship, RelationshipEndpoint, StateVariableNode, StaticDataNode } from "../../types.ts";
export type { ChangeType, ComponentType, DataflowNode, ImplementationDataflow } from "../../types.ts";

export type ContainerStatus = "new" | "changed" | "unchanged" | "deleted";

export interface GraphContainer extends Container {
  changeType: ContainerStatus;
  hldMismatch: boolean;
  functions: FunctionNode[];
  stateVariables: StateVariableNode[];
  staticData: StaticDataNode[];
}

export interface HelperMember {
  node: FunctionNode;
  parentId: string;
  depth: number;
}

export type Selection =
  | { type: "container"; containerId: string }
  | { type: "node"; nodeId: string }
  | { type: "relationship"; edge: string };

/** Collapsed edge identity uses the containers that own its endpoints. */
export function edgeKey(relationship: ResolvedRelationship, collapsed: boolean): string {
  const side = (endpoint: ResolvedEndpoint) => collapsed || endpoint.type === "ui-component" ? endpoint.boxId : endpoint.nodeId ?? endpoint.boxId;
  return JSON.stringify([relationship.relationship.type, side(relationship.from), side(relationship.to)]);
}

export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface GraphNode {
  id: string;
  name: string;
  changeType: ChangeType | ContainerStatus;
  functions: FunctionNode[];
  stateVariables: StateVariableNode[];
  staticData: StaticDataNode[];
  nodeType?: ComponentType | "static-data";
  uiDirection?: "read" | "write";
}

export interface ResolvedEndpoint {
  boxId: string;
  nodeId?: string;
  type: NodeType | ContainerType;
}

export interface ResolvedRelationship {
  relationship: Relationship;
  from: ResolvedEndpoint;
  to: ResolvedEndpoint;
  helperConnector?: boolean;
}

export function isInternalDataRelationship(relationship: ResolvedRelationship): boolean {
  return [relationship.from.type, relationship.to.type].some((type) => type === "state-variable" || type === "static-data")
    && relationship.from.boxId === relationship.to.boxId;
}

export interface GraphLayout {
  boxes: Map<string, Rect>;
  memberRects: Map<string, Rect>;
  helperFrameRects: Map<string, Rect>;
  missingFunctionRects: Map<string, Rect>;
  stateRects: Map<string, Rect>;
  compositionRelationships: ResolvedRelationship[];
  width: number;
  height: number;
}

export function resolveEndpoint(endpoint: RelationshipEndpoint, nodes: Map<string, DataflowNode>): ResolvedEndpoint {
  let resolved: ResolvedEndpoint;
  if ("nodeId" in endpoint) {
    const node = nodes.get(endpoint.nodeId)!;
    resolved = { boxId: node.type === "function" || node.type === "state-variable" ? node.containerId : node.id, nodeId: node.id, type: node.type };
  } else if ("containerId" in endpoint) {
    resolved = { boxId: endpoint.containerId, type: endpoint.type };
  }
  return resolved!;
}
