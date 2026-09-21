export type ChangeType = "added" | "modified" | "deleted" | "unchanged";
export type NodeType =
  | "user-input"
  | "user-output"
  | "external-dependency"
  | "system-input"
  | "system-output"
  | "system-state"
  | "static-data"
  | "data-processing";

export interface SystemDataflowNode {
  type: NodeType;
  name: string;
  description: string;
  medium: string;
  location: string;
  changeType?: ChangeType;
  algorithm?: string;
}

export interface SystemDataflowRelationship {
  id: string;
  from: string;
  to: string;
  type: "dataflow";
  changeType?: ChangeType;
  data: string;
  purpose: string;
}

export interface SystemDataflow {
  schemaVersion: 1;
  stage: "high-level-design" | "code-review";
  feature: string;
  nodes: SystemDataflowNode[];
  relationships: SystemDataflowRelationship[];
}

export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface GraphLayout {
  boxes: Map<string, Rect>;
  width: number;
  height: number;
}

export type Selection =
  | { type: "node"; name: string }
  | { type: "relationship"; id: string };
