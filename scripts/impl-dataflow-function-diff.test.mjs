import assert from "node:assert/strict";
import test from "node:test";

import { functionDiffSections } from "../common/impl-dataflow/visualizer/src/function-diff.ts";

test("folds unrelated lines around a function's changes in a shared file hunk", () => {
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
  assert.deepEqual(functionDiffSections(first, hunk), [
    { hidden: true, lines: [" class Service {"] },
    { hidden: false, lines: ["   first() {", "-    return 1;", "+    return 2;", "   }"] },
    { hidden: true, lines: ["   second() {", "-    return 3;", "+    return 4;", "   }", " }"] },
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
  assert.deepEqual(functionDiffSections(added, hunk), [
    { hidden: true, lines: [" existing();"] },
    { hidden: false, lines: ["+added();"] },
  ]);
});

test("folds distant context between two edits in the same function", () => {
  const hunk = {
    file: "src/service.ts",
    patch: [
      "@@ -1,13 +1,13 @@",
      " function run() {",
      "-  first();",
      "+  changedFirst();",
      ...Array.from({ length: 9 }, (_, index) => `   step${index}();`),
      "-  last();",
      "+  changedLast();",
      " }",
    ].join("\n"),
  };
  const run = {
    locations: [{ file: hunk.file, oldLines: [1, 13], newLines: [1, 13] }],
    changes: [
      { oldLines: [2, 2], newLines: [2, 2], tags: [] },
      { oldLines: [12, 12], newLines: [12, 12], tags: [] },
    ],
  };
  const sections = functionDiffSections(run, hunk);
  assert.equal(sections.length, 3);
  assert.equal(sections[1].hidden, true);
  assert.deepEqual(sections[1].lines, ["   step3();", "   step4();", "   step5();"]);
});
