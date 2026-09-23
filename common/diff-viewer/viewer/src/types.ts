export type LineRange = [number, number];

export interface DiffLocation {
  file: string;
  oldLines: LineRange | null;
  newLines: LineRange | null;
}

export interface DiffElement {
  kind: "file" | "class" | "method";
  name: string;
  parentId?: string;
  locations: DiffLocation[];
}

export interface DiffIndex {
  schemaVersion: 1;
  patch: string;
  elements: Record<string, DiffElement>;
}

export interface DiffRow {
  kind: "context" | "add" | "delete";
  text: string;
  oldLine?: number;
  newLine?: number;
}

export interface DiffFile {
  oldPath: string | null;
  newPath: string | null;
  path: string;
  binary: boolean;
  rows: DiffRow[];
  added: number;
  removed: number;
}

export type ChangeType = "added" | "modified" | "deleted";

export interface ElementStats {
  added: number;
  removed: number;
  changeType: ChangeType;
}
