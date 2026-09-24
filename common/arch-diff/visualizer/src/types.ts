export type ChangeType = "added" | "modified" | "deleted" | "unchanged";
export type ComponentType = "ui" | "external-io";

export interface MethodDiff {
  name: string;
  changeType: ChangeType;
  userFlow?: boolean;
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

export interface StateVariableDiff {
  name: string;
  changeType: ChangeType;
  userFlow?: boolean;
}

export interface ClassDiff {
  name: string;
  changeType: ChangeType;
  methods: MethodDiff[];
  stateVariables: StateVariableDiff[];
  variableExposure?: ExposedVariable[] | null;
  variableExposureCount?: number | null;
}

export interface ComponentDiff {
  name: string;
  type: ComponentType;
  changeType: ChangeType;
  userFlow?: boolean;
}

export interface ClassEndpoint {
  class: string;
}

export interface MethodEndpoint extends ClassEndpoint {
  method: string;
}

export interface StateVariableEndpoint extends ClassEndpoint {
  stateVariable: string;
}

export interface ComponentEndpoint {
  component: string;
}

export type RelationshipEndpoint = ClassEndpoint | MethodEndpoint | StateVariableEndpoint | ComponentEndpoint;

interface RelationshipBase {
  from: RelationshipEndpoint;
  to: RelationshipEndpoint;
  changeType: ChangeType;
}

export type Relationship = RelationshipBase & (
  | { type: "dataflow" | "state-read" | "state-update"; userFlow?: boolean; dataDescription: string; purpose: string }
  | { type: "composition"; userFlow?: never; dataDescription?: never; purpose?: never }
);

export interface UserFlowStep {
  id: number;
  text: string;
}

export interface UserFlowSet {
  name: string;
  steps: UserFlowStep[];
}

export interface ArchitectureDiff {
  schemaVersion: 10;
  stage: "high-level-design" | "code-review";
  userFlows?: UserFlowSet[];
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
  | { type: "component"; componentName: string }
  | { type: "relationship"; edge: string };

/**
 * Identifies a drawn edge. Collapsing methods merges dataflows between the same
 * classes into one line, so the key drops method names in that mode and a single
 * key then stands for every relationship merged into it.
 */
export function edgeKey(relationship: ResolvedRelationship, collapsed: boolean): string {
  const side = (endpoint: ResolvedEndpoint) => {
    if (endpoint.stateVariableName !== undefined) {
      return `${endpoint.nodeName}.${endpoint.stateVariableName}`;
    } else if (collapsed || endpoint.methodName === undefined) {
      return endpoint.nodeName;
    } else {
      return `${endpoint.nodeName}.${endpoint.methodName}`;
    }
  };
  return JSON.stringify([relationship.relationship.type, side(relationship.from), side(relationship.to)]);
}

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
  stateVariables: StateVariableDiff[];
  componentType?: ComponentType;
}

export interface ResolvedEndpoint {
  nodeName: string;
  methodName?: string;
  stateVariableName?: string;
  component: boolean;
}

export interface ResolvedRelationship {
  relationship: Relationship;
  from: ResolvedEndpoint;
  to: ResolvedEndpoint;
}

export function isInternalStateRelationship(relationship: ResolvedRelationship): boolean {
  return (relationship.relationship.type === "state-read" || relationship.relationship.type === "state-update")
    && relationship.from.nodeName === relationship.to.nodeName;
}

export interface GraphLayout {
  boxes: Map<string, Rect>;
  methodRects: Map<string, Rect>;
  stateRects: Map<string, Rect>;
  compositionRelationships: ResolvedRelationship[];
  width: number;
  height: number;
}

export function methodKey(className: string, methodName: string): string {
  return `${className}\u0000${methodName}`;
}

export function stateVariableKey(className: string, stateVariableName: string): string {
  return `${className}\u0000${stateVariableName}`;
}

export function resolveEndpoint(endpoint: RelationshipEndpoint): ResolvedEndpoint {
  if ("component" in endpoint) {
    return { nodeName: endpoint.component, component: true };
  } else if ("method" in endpoint) {
    return { nodeName: endpoint.class, methodName: endpoint.method, component: false };
  } else if ("stateVariable" in endpoint) {
    return { nodeName: endpoint.class, stateVariableName: endpoint.stateVariable, component: false };
  } else {
    return { nodeName: endpoint.class, component: false };
  }
}

export function mergeClassDataflows(relationships: ResolvedRelationship[]): ResolvedRelationship[] {
  const merged: ResolvedRelationship[] = [];
  const seen = new Set<string>();
  for (const item of relationships) {
    if (item.relationship.type === "dataflow" && !item.from.component && !item.to.component) {
      const key = JSON.stringify([item.from.nodeName, item.to.nodeName, item.relationship.changeType]);
      if (!seen.has(key)) {
        seen.add(key);
        merged.push({
          relationship: item.relationship,
          from: { nodeName: item.from.nodeName, component: false },
          to: { nodeName: item.to.nodeName, component: false },
        });
      }
    } else {
      merged.push(item);
    }
  }
  return merged;
}
