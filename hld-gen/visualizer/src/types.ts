export type ChangeType = "added" | "modified" | "deleted" | "unchanged";
export type ComponentType = "ui" | "external-io";

export interface MethodDiff {
  name: string;
  changeType: ChangeType;
}

export interface DeclaredAt {
  file: string;
  line: number;
  column: number;
}

export interface ExposedVariable {
  name: string;
  kind: "instance" | "parameter" | "local";
  method?: string;
  declaredAt: DeclaredAt;
}

export interface ClassDiff {
  name: string;
  changeType: ChangeType;
  methods: MethodDiff[];
  variableExposure: ExposedVariable[] | null;
  variableExposureCount?: number | null;
}

export interface ComponentDiff {
  name: string;
  type: ComponentType;
  changeType: ChangeType;
}

export interface ClassEndpoint {
  class: string;
}

export interface MethodEndpoint extends ClassEndpoint {
  method: string;
}

export interface ComponentEndpoint {
  component: string;
}

export type RelationshipEndpoint = ClassEndpoint | MethodEndpoint | ComponentEndpoint;

export interface Relationship {
  from: RelationshipEndpoint;
  to: RelationshipEndpoint;
  type: "dataflow" | "state-update" | "composition";
  label?: string;
  changeType: ChangeType;
}

export interface ArchitectureDiff {
  schemaVersion: 5;
  stage: "high level design";
  classes: ClassDiff[];
  components: ComponentDiff[];
  relationships: Relationship[];
  variableExposureCount?: number | null;
}

export interface MethodRef {
  className: string;
  methodName: string;
}

export type Selection =
  | { type: "class"; className: string }
  | { type: "method"; className: string; methodName: string }
  | { type: "component"; componentName: string };

export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface GraphNode {
  name: string;
  changeType: ChangeType;
  methods: MethodDiff[];
  componentType?: ComponentType;
}

export interface ResolvedEndpoint {
  nodeName: string;
  methodName?: string;
  component: boolean;
}

export interface ResolvedRelationship {
  relationship: Relationship;
  from: ResolvedEndpoint;
  to: ResolvedEndpoint;
}

export interface GraphLayout {
  boxes: Map<string, Rect>;
  methodRects: Map<string, Rect>;
  compositionRelationships: ResolvedRelationship[];
  width: number;
  height: number;
}

export function methodKey(className: string, methodName: string): string {
  return `${className}\u0000${methodName}`;
}

export function resolveEndpoint(endpoint: RelationshipEndpoint): ResolvedEndpoint {
  if ("component" in endpoint) {
    return { nodeName: endpoint.component, component: true };
  } else if ("method" in endpoint) {
    return { nodeName: endpoint.class, methodName: endpoint.method, component: false };
  } else {
    return { nodeName: endpoint.class, component: false };
  }
}
