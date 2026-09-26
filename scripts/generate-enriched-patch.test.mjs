import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { generateEnrichedPatch } from "../common/enriched-patch-viewer/generate-enriched-patch.mjs";

const toolkitDirectory = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const generatorPath = path.join(toolkitDirectory, "common", "enriched-patch-viewer", "generate-enriched-patch.mjs");

const modifiedPatch = [
  "diff --git a/src/ChangeService.js b/src/ChangeService.js",
  "index 1111111..2222222 100644",
  "--- a/src/ChangeService.js",
  "+++ b/src/ChangeService.js",
  "@@ -1,11 +1,12 @@",
  " export class ChangeService {",
  "   configure() {",
  "-    return 'old';",
  "+    return 'new';",
  "   }",
  " ",
  "   buildChangeSet(input) {",
  "+    const value = normalize(input);",
  "     return input;",
  "   }",
  " }",
  " ",
  "-export const flag = false;",
  "+export const flag = true;",
].join("\n");

test("indexes changed classes and methods while retaining unmatched file changes", () => {
  const index = generateEnrichedPatch(modifiedPatch);
  assert.deepEqual(index, {
    schemaVersion: 1,
    patch: modifiedPatch,
    elements: {
      "element-1": {
        kind: "file",
        name: "src/ChangeService.js",
        locations: [
          { file: "src/ChangeService.js", oldLines: [11, 11], newLines: null },
          { file: "src/ChangeService.js", oldLines: null, newLines: [12, 12] },
        ],
      },
      "element-2": {
        kind: "class",
        name: "ChangeService",
        parentId: "element-1",
        locations: [{ file: "src/ChangeService.js", oldLines: [1, 9], newLines: [1, 10] }],
      },
      "element-3": {
        kind: "method",
        name: "configure",
        parentId: "element-2",
        locations: [{ file: "src/ChangeService.js", oldLines: [2, 4], newLines: [2, 4] }],
      },
      "element-4": {
        kind: "method",
        name: "buildChangeSet",
        parentId: "element-2",
        locations: [{ file: "src/ChangeService.js", oldLines: [6, 8], newLines: [6, 9] }],
      },
    },
  });
});

test("indexes deleted classes and methods from the old file image", () => {
  const patch = [
    "diff --git a/src/OldService.ts b/src/OldService.ts",
    "deleted file mode 100644",
    "--- a/src/OldService.ts",
    "+++ /dev/null",
    "@@ -1,5 +0,0 @@",
    "-export class OldService {",
    "-  run() {",
    "-    return 1;",
    "-  }",
    "-}",
  ].join("\n");
  const index = generateEnrichedPatch(patch);
  assert.deepEqual(index.elements, {
    "element-1": { kind: "file", name: "src/OldService.ts", locations: [] },
    "element-2": {
      kind: "class",
      name: "OldService",
      parentId: "element-1",
      locations: [{ file: "src/OldService.ts", oldLines: [1, 5], newLines: null }],
    },
    "element-3": {
      kind: "method",
      name: "run",
      parentId: "element-2",
      locations: [{ file: "src/OldService.ts", oldLines: [2, 4], newLines: null }],
    },
  });
});

test("indexes top-level functions under their file", () => {
  const patch = [
    "diff --git a/src/run.ts b/src/run.ts",
    "new file mode 100644",
    "--- /dev/null",
    "+++ b/src/run.ts",
    "@@ -0,0 +1,3 @@",
    "+export function run() {",
    "+  return 1;",
    "+}",
  ].join("\n");
  const index = generateEnrichedPatch(patch);
  assert.deepEqual(index.elements, {
    "element-1": { kind: "file", name: "src/run.ts", locations: [] },
    "element-2": {
      kind: "method",
      name: "run",
      parentId: "element-1",
      locations: [{ file: "src/run.ts", oldLines: null, newLines: [1, 3] }],
    },
  });
});

test("indexes arrow functions as methods", () => {
  const patch = [
    "diff --git a/src/actions.ts b/src/actions.ts",
    "new file mode 100644",
    "--- /dev/null",
    "+++ b/src/actions.ts",
    "@@ -0,0 +1,5 @@",
    "+export class Actions {",
    "+  run = () => true;",
    "+}",
    "+",
    "+export const helper = () => false;",
  ].join("\n");
  const index = generateEnrichedPatch(patch);
  assert.deepEqual(Object.values(index.elements).map(({ kind, name, parentId }) => ({ kind, name, parentId })), [
    { kind: "file", name: "src/actions.ts", parentId: undefined },
    { kind: "class", name: "Actions", parentId: "element-1" },
    { kind: "method", name: "run", parentId: "element-2" },
    { kind: "method", name: "helper", parentId: "element-1" },
  ]);
  assert.deepEqual(index.elements["element-1"].locations, [
    { file: "src/actions.ts", oldLines: null, newLines: [4, 4] },
  ]);
});

test("captures unsupported text changes and binary files as file elements", () => {
  const patch = [
    "diff --git a/src/task.py b/src/task.py",
    "index 1111111..2222222 100644",
    "--- a/src/task.py",
    "+++ b/src/task.py",
    "@@ -1,2 +1,2 @@",
    " def run():",
    "-    return 1",
    "+    return 2",
    "diff --git a/assets/image.png b/assets/image.png",
    "index 3333333..4444444 100644",
    "Binary files a/assets/image.png and b/assets/image.png differ",
  ].join("\n");
  const index = generateEnrichedPatch(patch);
  assert.deepEqual(index.elements, {
    "element-1": {
      kind: "file",
      name: "src/task.py",
      locations: [
        { file: "src/task.py", oldLines: [2, 2], newLines: null },
        { file: "src/task.py", oldLines: null, newLines: [2, 2] },
      ],
    },
    "element-2": { kind: "file", name: "assets/image.png", locations: [] },
  });
});

test("keeps ambiguous declarations as file-level changes", () => {
  const patch = [
    "diff --git a/src/run.js b/src/run.js",
    "new file mode 100644",
    "--- /dev/null",
    "+++ b/src/run.js",
    "@@ -0,0 +1,7 @@",
    "+function run() {",
    "+  return 1;",
    "+}",
    "+",
    "+function run() {",
    "+  return 2;",
    "+}",
  ].join("\n");
  const index = generateEnrichedPatch(patch);
  assert.deepEqual(index.elements, {
    "element-1": {
      kind: "file",
      name: "src/run.js",
      locations: [{ file: "src/run.js", oldLines: null, newLines: [1, 7] }],
    },
  });
});

test("the CLI writes a validated enriched patch beside the source patch by default", async (t) => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "enriched-patch-"));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const patchPath = path.join(directory, "feature.code-review.patch");
  await writeFile(patchPath, modifiedPatch);

  const result = spawnSync(process.execPath, [generatorPath, patchPath], { encoding: "utf8" });
  assert.equal(result.status, 0, result.stderr);
  const index = JSON.parse(await readFile(path.join(directory, "feature.enriched-patch.json"), "utf8"));
  assert.equal(index.patch, modifiedPatch);
  assert.equal(index.elements["element-4"].name, "buildChangeSet");
});

test("rejects a patch that does not contain full file context", () => {
  const patch = [
    "diff --git a/src/task.py b/src/task.py",
    "--- a/src/task.py",
    "+++ b/src/task.py",
    "@@ -10 +10 @@",
    "-old",
    "+new",
  ].join("\n");
  assert.throws(() => generateEnrichedPatch(patch), /is not full-context at line 1/);
});
