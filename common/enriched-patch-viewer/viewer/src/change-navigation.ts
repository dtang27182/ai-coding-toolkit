import type { DiffRow } from "./types.ts";

export interface ChangeBlock {
  startRowIndex: number;
  endRowIndex: number;
}

export interface ChangeRun extends ChangeBlock {
  kind: "add" | "delete";
}

export function changeBlocks(rows: DiffRow[]): ChangeBlock[] {
  const blocks: ChangeBlock[] = [];
  let activeBlock: ChangeBlock | undefined;

  rows.forEach((row, rowIndex) => {
    if (row.kind === "context") {
      activeBlock = undefined;
    } else if (row.kind === "add" || row.kind === "delete") {
      if (activeBlock === undefined) {
        activeBlock = { startRowIndex: rowIndex, endRowIndex: rowIndex };
        blocks.push(activeBlock);
      } else {
        activeBlock.endRowIndex = rowIndex;
      }
    }
  });

  return blocks;
}

export function changeRuns(rows: DiffRow[]): ChangeRun[] {
  const runs: ChangeRun[] = [];
  let activeRun: ChangeRun | undefined;

  rows.forEach((row, rowIndex) => {
    if (row.kind === "context") {
      activeRun = undefined;
    } else if (row.kind === "add" || row.kind === "delete") {
      if (activeRun === undefined || activeRun.kind !== row.kind) {
        activeRun = { kind: row.kind, startRowIndex: rowIndex, endRowIndex: rowIndex };
        runs.push(activeRun);
      } else {
        activeRun.endRowIndex = rowIndex;
      }
    }
  });

  return runs;
}
