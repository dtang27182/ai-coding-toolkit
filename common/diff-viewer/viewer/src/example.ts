import type { DiffIndex } from "./types.ts";

const patch = [
  "diff --git a/src/services/ChangeService.ts b/src/services/ChangeService.ts",
  "index 1111111..2222222 100644",
  "--- a/src/services/ChangeService.ts",
  "+++ b/src/services/ChangeService.ts",
  "@@ -1,10 +1,11 @@",
  " export class ChangeService {",
  "   configure() {",
  "-    return 'draft';",
  "+    return 'ready';",
  "   }",
  " ",
  "   build(input: string) {",
  "+    const normalized = input.trim();",
  "-    return input;",
  "+    return normalized;",
  "   }",
  " }",
  "diff --git a/src/utils/format.ts b/src/utils/format.ts",
  "new file mode 100644",
  "--- /dev/null",
  "+++ b/src/utils/format.ts",
  "@@ -0,0 +1,3 @@",
  "+export function formatName(value: string) {",
  "+  return value.toLowerCase();",
  "+}",
].join("\n");

export const exampleIndex: DiffIndex = {
  schemaVersion: 1,
  patch,
  elements: {
    "element-1": {
      kind: "file",
      name: "src/services/ChangeService.ts",
      locations: [],
    },
    "element-2": {
      kind: "class",
      name: "ChangeService",
      parentId: "element-1",
      locations: [{ file: "src/services/ChangeService.ts", oldLines: [1, 10], newLines: [1, 11] }],
    },
    "element-3": {
      kind: "method",
      name: "configure",
      parentId: "element-2",
      locations: [{ file: "src/services/ChangeService.ts", oldLines: [2, 4], newLines: [2, 4] }],
    },
    "element-4": {
      kind: "method",
      name: "build",
      parentId: "element-2",
      locations: [{ file: "src/services/ChangeService.ts", oldLines: [6, 8], newLines: [6, 9] }],
    },
    "element-5": {
      kind: "file",
      name: "src/utils/format.ts",
      locations: [],
    },
    "element-6": {
      kind: "method",
      name: "formatName",
      parentId: "element-5",
      locations: [{ file: "src/utils/format.ts", oldLines: null, newLines: [1, 3] }],
    },
  },
};
