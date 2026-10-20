import { tokenLabel } from "../../../sys-dataflow/visualizer/src/pairing.ts";
import type { GraphComponent } from "./filter.ts";

export interface UiPair {
  label: string;
  read: GraphComponent;
  write: GraphComponent;
}

export function findUiPairs(components: readonly GraphComponent[]): UiPair[] {
  const writes = new Map(components.filter((node) => node.uiDirection === "write").map((node) => [node.nodeId, node]));
  return components.filter((node) => node.uiDirection === "read" && writes.has(node.nodeId))
    .map((read, index) => ({ label: tokenLabel(index), read, write: writes.get(read.nodeId)! }));
}
