import assert from "node:assert/strict";
import test from "node:test";

import { functionDiffLines } from "../common/impl-dataflow/visualizer/src/function-diff.ts";

test("shows only a function's changed lines and nearby context from a shared file hunk", () => {
  const hunk = {
    file: "src/service.ts",
    patch: [
      "@@ -1,8 +1,8 @@",
      " class Service {",
      "   first() {",
      "-    return 1;",
      "+    return 2;",
      "   }",
      "   second() {",
      "-    return 3;",
      "+    return 4;",
      "   }",
      " }",
    ].join("\n"),
  };
  const first = {
    locations: [{ file: hunk.file, oldLines: [2, 4], newLines: [2, 4] }],
    changes: [{ oldLines: [3, 3], newLines: [3, 3], tags: [] }],
  };
  assert.deepEqual(functionDiffLines(first, hunk), [
    "   first() {",
    "-    return 1;",
    "+    return 2;",
    "   }",
  ]);
});

test("uses the new-side range for an added function", () => {
  const hunk = {
    file: "src/service.ts",
    patch: "@@ -1 +1,2 @@\n existing();\n+added();",
  };
  const added = {
    locations: [{ file: hunk.file, oldLines: null, newLines: [2, 2] }],
    changes: [{ oldLines: null, newLines: [2, 2], tags: [] }],
  };
  assert.deepEqual(functionDiffLines(added, hunk), ["+added();"]);
});
