export type ChangeType = "added" | "modified" | "deleted" | "unchanged";
export type ComponentType = "ui-component" | "system-input" | "system-output" | "external-dependency";
export type NodeType = "function" | ComponentType | "static-data" | "state-variable";
export type ContainerType = "class" | "module";

interface NodeBase {
  id: string;
  name: string;
  type: NodeType;
  description?: string;
  changeType: ChangeType;
  diffHunkIds?: string[];
}

export type FunctionNode = NodeBase & { type: "function"; containerId: string };
export type StateVariableNode = NodeBase & { type: "state-variable"; containerId: string };
export type StaticDataNode = NodeBase & { type: "static-data"; containerId?: string };
export type BoundaryNode = NodeBase & { type: ComponentType; description: string };
export type DataflowNode = FunctionNode | StateVariableNode | StaticDataNode | BoundaryNode;

export interface Container {
  id: string;
  name: string;
  type: ContainerType;
  diffHunkIds?: string[];
}

export interface NodeEndpoint {
  nodeId: string;
  type: NodeType;
}

export interface ClassContainerEndpoint {
  containerId: string;
  type: "class";
}

export type RelationshipEndpoint = NodeEndpoint | ClassContainerEndpoint;

interface RelationshipBase {
  changeType: ChangeType;
  diffHunkIds?: string[];
}

export type Relationship = RelationshipBase & (
  | { type: "dataflow"; from: NodeEndpoint; to: NodeEndpoint; dataDescription: string; purpose: string }
  | { type: "composition"; from: ClassContainerEndpoint; to: ClassContainerEndpoint; dataDescription?: never; purpose?: never }
);

export interface ImplementationDataflow {
  schemaVersion: 14;
  stage: "high-level-design" | "code-review";
  diffHunks?: { id: string; file: string; patch: string }[];
  nodes: DataflowNode[];
  containers: Container[];
  relationships: Relationship[];
  changedClassCount?: number;
  changedFunctionCount?: number;
  changedComponentCount?: number;
  changedDataflowRelationshipCount?: number;
}
