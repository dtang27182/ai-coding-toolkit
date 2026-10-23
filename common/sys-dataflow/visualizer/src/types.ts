export type ChangeType = "added" | "modified" | "deleted" | "unchanged";
export type NodeType =
  | "user-input"
  | "user-output"
  | "external-dependency"
  | "system-input"
  | "system-output"
  | "system-state-read"
  | "system-state-write"
  | "static-data"
  | "data-processing";

export interface SystemDataflowNode {
  type: NodeType;
  name: string;
  journeySequenceId: number;
  description: string;
  medium: string;
  location: string;
  changeType?: ChangeType;
  "pseudo-code"?: string;
  diffHunkIds?: string[];
}

export interface SystemDataflowRelationship {
  id: string;
  from: string;
  to: string;
  type: "dataflow";
  changeType?: ChangeType;
  data: string;
  purpose: string;
  diffHunkIds?: string[];
}

export interface DiffHunk {
  id: string;
  file: string;
  patch: string;
}

export interface SystemDataflowSubgraph {
  id: string;
  name: string;
  journeySequenceId: number;
  nodes: SystemDataflowNode[];
  relationships: SystemDataflowRelationship[];
}

export interface SystemDataflow {
  schemaVersion: 4;
  stage: "high-level-design" | "inspect-code" | "code-review";
  feature: string;
  diffHunks?: DiffHunk[];
  subgraphs: SystemDataflowSubgraph[];
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
