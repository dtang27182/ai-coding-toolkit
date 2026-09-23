import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, utimes, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { findNewestDiffIndex } from "../common/diff-viewer/visualizer/default-diff-index.mjs";
import { exampleIndex } from "../common/diff-viewer/visualizer/src/example.ts";
import { buildTree, statsForElement, unmatchedCount } from "../common/diff-viewer/visualizer/src/model.ts";
import { parsePatch } from "../common/diff-viewer/visualizer/src/patch.ts";
import { isLineWrapShortcut } from "../common/diff-viewer/visualizer/src/shortcuts.ts";

test("parses complete file rows and change counts from the embedded patch", () => {
  const files = parsePatch(exampleIndex.patch);
  assert.equal(files.length, 2);
  assert.deepEqual(
    files.map(({ path, added, removed }) => ({ path, added, removed })),
    [
      { path: "src/services/ChangeService.ts", added: 3, removed: 2 },
      { path: "src/utils/format.ts", added: 3, removed: 0 },
    ],
  );
  assert.deepEqual(files[0].rows[0], {
    kind: "context",
    text: "export class ChangeService {",
    oldLine: 1,
    newLine: 1,
  });
});

test("uses diff headers for binary files without text-file headers", () => {
  const files = parsePatch([
    "diff --git a/assets/image.png b/assets/image.png",
    "new file mode 100644",
    "index 0000000..2222222",
    "GIT binary patch",
  ].join("\n"));
  assert.deepEqual(files, [{
    oldPath: null,
    newPath: "assets/image.png",
    path: "assets/image.png",
    binary: true,
    rows: [],
    added: 0,
    removed: 0,
  }]);
});

test("builds directory nodes above indexed files and preserves entity nesting", () => {
  const tree = buildTree(exampleIndex);
  assert.equal(tree[0].kind, "directory");
  assert.equal(tree[0].name, "src");
  assert.equal(tree[0].children[0].kind, "directory");
  assert.equal(tree[0].children[0].name, "services");
  assert.equal(tree[0].children[0].children[0].kind, "element");
  assert.equal(tree[0].children[0].children[0].element.name, "src/services/ChangeService.ts");
  assert.equal(tree[0].children[0].children[0].children[0].element.name, "ChangeService");
});

test("derives entity line counts and file-level unmatched counts", () => {
  const files = parsePatch(exampleIndex.patch);
  assert.deepEqual(statsForElement(exampleIndex.elements["element-3"], files), {
    added: 1,
    removed: 1,
    changeType: "modified",
  });
  assert.deepEqual(statsForElement(exampleIndex.elements["element-6"], files), {
    added: 3,
    removed: 0,
    changeType: "added",
  });
  assert.equal(unmatchedCount(exampleIndex.elements["element-1"]), 0);
});

test("finds the newest generated index under the configured output directory", async (t) => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "diff-visualizer-"));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const repositoryDirectory = path.join(directory, "repository");
  const toolkitDirectory = path.join(directory, "toolkit");
  const outputDirectory = path.join(repositoryDirectory, "docs", "plans", "feature");
  await mkdir(outputDirectory, { recursive: true });
  await mkdir(toolkitDirectory, { recursive: true });
  await writeFile(path.join(toolkitDirectory, "config.json"), '{"outputDirectory":"docs/plans"}\n');
  const older = path.join(outputDirectory, "older.diff-index.json");
  const newer = path.join(outputDirectory, "newer.diff-index.json");
  await writeFile(older, "{}");
  await writeFile(newer, "{}");
  await utimes(older, new Date(1_000), new Date(1_000));
  await utimes(newer, new Date(2_000), new Date(2_000));
  assert.equal(await findNewestDiffIndex(repositoryDirectory, toolkitDirectory), newer);
});

test("recognizes Alt or Option plus Z as the line-wrapping shortcut", () => {
  assert.equal(isLineWrapShortcut({ altKey: true, ctrlKey: false, metaKey: false, code: "KeyZ" }), true);
  assert.equal(isLineWrapShortcut({ altKey: false, ctrlKey: false, metaKey: false, code: "KeyZ" }), false);
  assert.equal(isLineWrapShortcut({ altKey: true, ctrlKey: false, metaKey: false, code: "KeyX" }), false);
  assert.equal(isLineWrapShortcut({ altKey: true, ctrlKey: true, metaKey: false, code: "KeyZ" }), false);
});
