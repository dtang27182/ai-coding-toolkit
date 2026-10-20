export type ChangeType = "added" | "modified" | "deleted" | "unchanged";
export type ComponentType = "ui-component" | "system-input" | "system-output" | "external-dependency";
export type NodeType = "function" | ComponentType | "static-data" | "state-variable";
export type ContainerType = "class" | "module";

export interface RenameOrigin {
  name: string;
  sourceFile: string;
}

interface NodeBase {
  id: string;
  name: string;
  type: NodeType;
  description?: string;
  changeType: ChangeType;
  initialization: boolean;
  diffHunkIds?: string[];
}

export type FunctionNode = NodeBase & {
  type: "function";
  containerId: string;
  sourceFile: string;
  renamedFrom?: RenameOrigin & { containerName?: string };
  subtype?: "missing-from-cr";
  "hld-change-mismatch"?: boolean;
  hldChangeType?: ChangeType | null;
};
export type StateVariableNode = NodeBase & { type: "state-variable"; containerId: string };
export type StaticDataNode = NodeBase & { type: "static-data"; containerId?: string };
export type BoundaryNode = NodeBase & { type: ComponentType; description: string };
export type DataflowNode = FunctionNode | StateVariableNode | StaticDataNode | BoundaryNode;

export interface Container {
  id: string;
  name: string;
  type: ContainerType;
  sourceFile: string;
  renamedFrom?: RenameOrigin;
  diffHunkIds?: string[];
  generatedBy?: "annotate-hld-function-coverage";
}

export interface NodeEndpoint<Type extends NodeType = NodeType> {
  nodeId: string;
  type: Type;
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
  | ({ type: "dataflow"; dataDescription: string; purpose: string } & (
    | { from: NodeEndpoint<"function">; to: NodeEndpoint<"function">; transferType: "arguments" | "return" }
    | { from: NodeEndpoint<Exclude<NodeType, "function">>; to: NodeEndpoint; transferType?: never }
    | { from: NodeEndpoint; to: NodeEndpoint<Exclude<NodeType, "function">>; transferType?: never }
  ))
  | { type: "composition"; from: ClassContainerEndpoint; to: ClassContainerEndpoint; dataDescription?: never; purpose?: never }
);

export interface ImplementationDataflow {
  schemaVersion: 18;
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
