import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { generateEnrichedPatch } from "../common/enriched-patch/generate-enriched-patch.mjs";
import { changeOwnershipErrors } from "../enrich-diff/scripts/validate-enriched-patch.mjs";

const toolkitDirectory = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const generatorPath = path.join(toolkitDirectory, "common", "enriched-patch", "generate-enriched-patch.mjs");

function withoutChanges(elements) {
  return Object.fromEntries(Object.entries(elements).map(([id, { changes, ...element }]) => [id, element]));
}

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
  assert.deepEqual({ ...index, elements: withoutChanges(index.elements) }, {
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
  assert.deepEqual(Object.fromEntries(Object.entries(index.elements).map(([id, element]) => [id, element.changes])), {
    "element-1": [{ oldLines: [11, 11], newLines: [12, 12], tags: [] }],
    "element-2": [],
    "element-3": [{ oldLines: [3, 3], newLines: [3, 3], tags: [] }],
    "element-4": [{ oldLines: null, newLines: [7, 7], tags: [] }],
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
  assert.deepEqual(withoutChanges(index.elements), {
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
  assert.deepEqual(index.elements["element-2"].changes, [
    { oldLines: [1, 1], newLines: null, tags: [] },
    { oldLines: [5, 5], newLines: null, tags: [] },
  ]);
  assert.deepEqual(index.elements["element-3"].changes, [
    { oldLines: [2, 4], newLines: null, tags: [] },
  ]);
});

test("separates changes to one element when context rows intervene", () => {
  const patch = [
    "diff --git a/notes.txt b/notes.txt",
    "index 1111111..2222222 100644",
    "--- a/notes.txt",
    "+++ b/notes.txt",
    "@@ -1,4 +1,4 @@",
    "-old first",
    "+new first",
    " unchanged",
    "-old second",
    "+new second",
    " unchanged",
  ].join("\n");
  const index = generateEnrichedPatch(patch);
  assert.deepEqual(index.elements["element-1"].changes, [
    { oldLines: [1, 1], newLines: [1, 1], tags: [] },
    { oldLines: [3, 3], newLines: [3, 3], tags: [] },
  ]);
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
  assert.deepEqual(withoutChanges(index.elements), {
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
  assert.deepEqual(withoutChanges(index.elements), {
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
  assert.deepEqual(index.elements["element-2"].changes, []);
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
  assert.deepEqual(withoutChanges(index.elements), {
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
  const patchPath = path.join(directory, "feature.patch");
  await writeFile(patchPath, modifiedPatch);

  const result = spawnSync(process.execPath, [generatorPath, patchPath], { encoding: "utf8" });
  assert.equal(result.status, 0, result.stderr);
  const index = JSON.parse(await readFile(path.join(directory, "feature.enriched-patch.json"), "utf8"));
  assert.equal(index.patch, modifiedPatch);
  assert.equal(index.elements["element-4"].name, "buildChangeSet");
});

test("pairs HLD-declared file, class, and method renames without changing the embedded patch", async (t) => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "enriched-patch-rename-"));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const patch = [
    "diff --git a/src/OldService.ts b/src/OldService.ts",
    "deleted file mode 100644",
    "--- a/src/OldService.ts",
    "+++ /dev/null",
    "@@ -1,3 +0,0 @@",
    "-export class OldService {",
    "-  run() { return 1; }",
    "-}",
    "diff --git a/src/NewService.ts b/src/NewService.ts",
    "new file mode 100644",
    "--- /dev/null",
    "+++ b/src/NewService.ts",
    "@@ -0,0 +1,3 @@",
    "+export class NewService {",
    "+  execute() { return 2; }",
    "+}",
  ].join("\n");
  const hld = {
    stage: "high-level-design",
    containers: [
      { id: "service", type: "class", name: "NewService", sourceFile: "src/NewService.ts", renamedFrom: { name: "OldService", sourceFile: "src/OldService.ts" } },
      { id: "module", type: "module", name: "new", sourceFile: "src/NewService.ts", renamedFrom: { name: "old", sourceFile: "src/OldService.ts" } },
    ],
    nodes: [{ type: "function", name: "execute", sourceFile: "src/NewService.ts", containerId: "service", renamedFrom: { name: "run", sourceFile: "src/OldService.ts" } }],
  };
  const patchPath = path.join(directory, "feature.patch");
  const hldPath = path.join(directory, "feature.impl-dataflow.json");
  await writeFile(patchPath, patch);
  await writeFile(hldPath, JSON.stringify(hld));

  const result = spawnSync(process.execPath, [generatorPath, patchPath, "--hld-impl-dataflow", hldPath], { encoding: "utf8" });
  assert.equal(result.status, 0, result.stderr);
  const index = JSON.parse(await readFile(path.join(directory, "feature.enriched-patch.json"), "utf8"));
  assert.equal(index.patch, patch);
  assert.deepEqual(index.renames, [
    { from: "element-1", to: "element-4" },
    { from: "element-2", to: "element-5" },
    { from: "element-3", to: "element-6" },
  ]);
  assert.deepEqual(changeOwnershipErrors(index), []);
  assert.deepEqual(generateEnrichedPatch(patch, { ...hld, containers: [hld.containers[0]] }).renames, [
    { from: "element-2", to: "element-5" },
    { from: "element-3", to: "element-6" },
  ]);
});

test("pairs a same-file function rename only when both declarations match", () => {
  const patch = [
    "diff --git a/src/actions.ts b/src/actions.ts",
    "--- a/src/actions.ts",
    "+++ b/src/actions.ts",
    "@@ -1,3 +1,3 @@",
    "-export function oldAction() {",
    "+export function newAction() {",
    "   return true;",
    " }",
  ].join("\n");
  const hld = {
    stage: "high-level-design",
    containers: [{ id: "module", type: "module", name: "actions", sourceFile: "src/actions.ts" }],
    nodes: [{ type: "function", name: "newAction", sourceFile: "src/actions.ts", containerId: "module", renamedFrom: { name: "oldAction", sourceFile: "src/actions.ts" } }],
  };
  const index = generateEnrichedPatch(patch, hld);
  assert.deepEqual(index.renames, [{ from: "element-2", to: "element-3" }]);
  assert.equal(index.patch, patch);
  hld.nodes[0].renamedFrom.name = "unrelatedAction";
  assert.deepEqual(generateEnrichedPatch(patch, hld).renames, []);
});

test("pairs an HLD-declared module file move even when its contents are unchanged", () => {
  const patch = [
    "diff --git a/src/old.ts b/src/old.ts",
    "deleted file mode 100644",
    "--- a/src/old.ts",
    "+++ /dev/null",
    "@@ -1 +0,0 @@",
    "-export const value = 1;",
    "diff --git a/src/new.ts b/src/new.ts",
    "new file mode 100644",
    "--- /dev/null",
    "+++ b/src/new.ts",
    "@@ -0,0 +1 @@",
    "+export const value = 1;",
  ].join("\n");
  const hld = {
    stage: "high-level-design",
    containers: [{ id: "module", type: "module", name: "new", sourceFile: "src/new.ts", renamedFrom: { name: "old", sourceFile: "src/old.ts" } }],
    nodes: [],
  };
  const index = generateEnrichedPatch(patch, hld);
  assert.equal(index.patch, patch);
  assert.deepEqual(index.renames, [{ from: "element-1", to: "element-2" }]);
});

test("pairs a moved function without pairing files that continue to exist", () => {
  const patch = [
    "diff --git a/src/old.ts b/src/old.ts",
    "--- a/src/old.ts",
    "+++ b/src/old.ts",
    "@@ -1,4 +1 @@",
    "-export function oldAction() {",
    "-  return true;",
    "-}",
    " export const keep = true;",
    "diff --git a/src/new.ts b/src/new.ts",
    "--- a/src/new.ts",
    "+++ b/src/new.ts",
    "@@ -1 +1,4 @@",
    " export const existing = true;",
    "+export function newAction() {",
    "+  return true;",
    "+}",
  ].join("\n");
  const hld = {
    stage: "high-level-design",
    containers: [{ id: "module", type: "module", name: "new", sourceFile: "src/new.ts" }],
    nodes: [{ type: "function", name: "newAction", sourceFile: "src/new.ts", containerId: "module", renamedFrom: { name: "oldAction", sourceFile: "src/old.ts" } }],
  };
  const index = generateEnrichedPatch(patch, hld);
  assert.deepEqual(index.renames, [{ from: "element-2", to: "element-4" }]);
  assert.equal(index.patch, patch);
  assert.deepEqual(changeOwnershipErrors(index), []);
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
