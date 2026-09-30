export type ChangeType = "added" | "modified" | "deleted" | "unchanged";
export type ComponentType = "ui-component" | "system-input" | "system-output" | "external-dependency";

export interface FunctionDiff {
  name: string;
  changeType: ChangeType;
  diffHunkIds?: string[];
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
  function?: string;
  declaredAt: DeclaredAt;
}

export interface StateVariableDiff {
  name: string;
  changeType: ChangeType;
  diffHunkIds?: string[];
  userFlow?: boolean;
}

export interface ClassDiff {
  name: string;
  changeType: ChangeType;
  diffHunkIds?: string[];
  functions: FunctionDiff[];
  stateVariables: StateVariableDiff[];
  variableExposure?: ExposedVariable[] | null;
  variableExposureCount?: number | null;
}

export interface ModuleDiff {
  name: string;
  changeType: ChangeType;
  diffHunkIds?: string[];
  functions: FunctionDiff[];
}

export type GraphContainerDiff = ClassDiff & { containerType?: "module" };

export interface ComponentDiff {
  name: string;
  description: string;
  type: ComponentType;
  changeType: ChangeType;
  diffHunkIds?: string[];
  userFlow?: boolean;
}

export interface StaticDataDiff {
  name: string;
  changeType: ChangeType;
  diffHunkIds?: string[];
  userFlow?: boolean;
}

export interface ClassEndpoint {
  class: string;
}

export interface ClassFunctionEndpoint extends ClassEndpoint {
  function: string;
}

export interface StateVariableEndpoint extends ClassEndpoint {
  stateVariable: string;
}

export interface ComponentEndpoint {
  component: string;
}

export interface StaticDataEndpoint {
  staticData: string;
}

export interface ModuleFunctionEndpoint {
  module: string;
  function: string;
}

export type FunctionEndpoint = ClassFunctionEndpoint | ModuleFunctionEndpoint;

export type RelationshipEndpoint = ClassEndpoint | FunctionEndpoint | StateVariableEndpoint | ComponentEndpoint | StaticDataEndpoint;

interface RelationshipBase {
  from: RelationshipEndpoint;
  to: RelationshipEndpoint;
  changeType: ChangeType;
  diffHunkIds?: string[];
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

export interface ImplementationDataflow {
  schemaVersion: 13;
  stage: "high-level-design" | "code-review";
  diffHunks?: { id: string; file: string; patch: string }[];
  userFlows?: UserFlowSet[];
  classes: ClassDiff[];
  modules?: ModuleDiff[];
  components: ComponentDiff[];
  staticData: StaticDataDiff[];
  relationships: Relationship[];
  variableExposureCount?: number | null;
}

export interface FunctionRef {
  className: string;
  functionName: string;
}

export type Selection =
  | { type: "class"; className: string }
  | { type: "function"; className: string; functionName: string }
  | { type: "component"; componentName: string }
  | { type: "static-data"; staticDataName: string }
  | { type: "relationship"; edge: string };

/**
 * Identifies a drawn edge. Collapsing functions merges dataflows between the same
 * classes into one line, so the key drops function names in that mode and a single
 * key then stands for every relationship merged into it.
 */
export function edgeKey(relationship: ResolvedRelationship, collapsed: boolean): string {
  const side = (endpoint: ResolvedEndpoint) => {
    if (endpoint.stateVariableName !== undefined) {
      return `${endpoint.nodeName}.${endpoint.stateVariableName}`;
    } else if (collapsed || endpoint.functionName === undefined) {
      return endpoint.nodeName;
    } else {
      return `${endpoint.nodeName}.${endpoint.functionName}`;
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
  functions: FunctionDiff[];
  stateVariables: StateVariableDiff[];
  nodeType?: ComponentType | "static-data";
}

export interface ResolvedEndpoint {
  nodeName: string;
  functionName?: string;
  stateVariableName?: string;
  component: boolean;
  staticData?: boolean;
  module?: boolean;
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
  functionRects: Map<string, Rect>;
  stateRects: Map<string, Rect>;
  compositionRelationships: ResolvedRelationship[];
  width: number;
  height: number;
}

export function functionKey(className: string, functionName: string): string {
  return `${className}\u0000${functionName}`;
}

export function stateVariableKey(className: string, stateVariableName: string): string {
  return `${className}\u0000${stateVariableName}`;
}

export function resolveEndpoint(endpoint: RelationshipEndpoint): ResolvedEndpoint {
  if ("component" in endpoint) {
    return { nodeName: endpoint.component, component: true };
  } else if ("staticData" in endpoint) {
    return { nodeName: endpoint.staticData, component: false, staticData: true };
  } else if ("module" in endpoint) {
    return { nodeName: endpoint.module, functionName: endpoint.function, component: false, module: true };
  } else if ("function" in endpoint) {
    return { nodeName: endpoint.class, functionName: endpoint.function, component: false };
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
    if (item.relationship.type === "dataflow" && !item.from.component && !item.from.staticData && !item.to.component && !item.to.staticData) {
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
