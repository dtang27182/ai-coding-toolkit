import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, utimes, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";

import { changeBlocks, changeRuns } from "../common/diff-viewer/viewer/src/change-navigation.ts";
import { exampleIndex } from "../common/diff-viewer/viewer/src/example.ts";
import { clampSidebarWidth } from "../common/diff-viewer/viewer/src/layout.ts";
import { buildTree, expandedNodeIds, expansionStates, statsForElement, unmatchedCount } from "../common/diff-viewer/viewer/src/model.ts";
import { firstChangedLine, parsePatch } from "../common/diff-viewer/viewer/src/patch.ts";
import { isLineWrapShortcut } from "../common/diff-viewer/viewer/src/shortcuts.ts";

const toolkitDirectory = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

async function defaultIndexFileName(configPath, repositoryDirectory) {
  const originalDirectory = process.cwd();
  process.chdir(repositoryDirectory);
  try {
    const { default: config } = await import(`${pathToFileURL(configPath).href}?repository=${Date.now()}`);
    let middleware;
    config.plugins[0].configureServer({ middlewares: { use(handler) { middleware = handler; } } });
    const response = {
      statusCode: 200,
      setHeader() {},
      end(body) { this.body = body; },
    };
    await middleware({ method: "GET", url: "/__diff-index/default" }, response, () => {
      assert.fail("The default index endpoint did not handle the request.");
    });
    assert.equal(response.statusCode, 200);
    return JSON.parse(response.body).fileName;
  } finally {
    process.chdir(originalDirectory);
  }
}

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

test("locates the first changed line when opening a file-level diff", () => {
  const files = parsePatch(exampleIndex.patch);
  assert.deepEqual(firstChangedLine(files[0]), { side: "old", line: 3 });
  assert.deepEqual(firstChangedLine(files[1]), { side: "new", line: 1 });
  assert.equal(firstChangedLine({
    oldPath: "assets/image.png",
    newPath: "assets/image.png",
    path: "assets/image.png",
    binary: true,
    rows: [],
    added: 0,
    removed: 0,
  }), undefined);
});

test("groups adjacent changed lines for navigation and same-kind lines for the minimap", () => {
  const rows = parsePatch(exampleIndex.patch)[0].rows;
  assert.deepEqual(changeBlocks(rows), [
    { startRowIndex: 2, endRowIndex: 3 },
    { startRowIndex: 7, endRowIndex: 9 },
  ]);
  assert.deepEqual(changeRuns(rows), [
    { kind: "delete", startRowIndex: 2, endRowIndex: 2 },
    { kind: "add", startRowIndex: 3, endRowIndex: 3 },
    { kind: "add", startRowIndex: 7, endRowIndex: 7 },
    { kind: "delete", startRowIndex: 8, endRowIndex: 8 },
    { kind: "add", startRowIndex: 9, endRowIndex: 9 },
  ]);
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
  assert.deepEqual(
    tree[0].children[0].children[0].children[0].children.map((node) => node.element.name),
    ["build", "configure"],
  );
});

test("sorts every navigation level by its full hierarchical key", () => {
  const tree = buildTree({
    schemaVersion: 1,
    patch: "unused by tree construction",
    elements: {
      "element-1": { kind: "file", name: "src/zeta.ts", locations: [] },
      "element-2": { kind: "method", name: "zoom", parentId: "element-1", locations: [] },
      "element-3": { kind: "method", name: "alpha", parentId: "element-1", locations: [] },
      "element-4": { kind: "file", name: "src/alpha/tool.ts", locations: [] },
      "element-5": { kind: "class", name: "Worker", parentId: "element-4", locations: [] },
      "element-6": { kind: "method", name: "start", parentId: "element-5", locations: [] },
    },
  });
  const src = tree[0];
  assert.deepEqual(src.children.map((node) => node.name ?? node.element.name), ["alpha", "src/zeta.ts"]);
  const zeta = src.children[1];
  assert.deepEqual(zeta.children.map((node) => node.element.name), ["alpha", "zoom"]);
  assert.equal(src.sortKey, "src");
  assert.equal(zeta.sortKey, "src/zeta.ts");
  assert.equal(zeta.children[0].sortKey, "src/zeta.ts/alpha");
});

test("collapse all keeps parent directories open and hides files in leaf directories", () => {
  const tree = buildTree(exampleIndex);
  const collapsed = expandedNodeIds(tree, false);
  const expanded = expandedNodeIds(tree);
  const expandableNodes = [];
  const visit = (nodes) => {
    for (const node of nodes) {
      if (node.children.length > 0) {
        expandableNodes.push(node);
        visit(node.children);
      }
    }
  };
  visit(tree);

  assert.equal(expandableNodes.every((node) => expanded.has(node.id)), true);
  assert.equal(collapsed.has(tree[0].id), true);
  assert.equal(tree[0].children.every((node) => node.kind === "directory" && !collapsed.has(node.id)), true);
  assert.equal(expandableNodes.filter((node) => node.kind === "element").every((node) => !collapsed.has(node.id)), true);
});

test("preserves expansion by tree identity when index element IDs change", () => {
  const previousTree = buildTree(exampleIndex);
  const previousExpanded = expandedNodeIds(previousTree);
  previousExpanded.delete("directory:src/services");
  previousExpanded.delete("element-2");
  previousExpanded.delete("element-5");
  const ids = {
    "element-1": "service-file",
    "element-2": "service-class",
    "element-3": "configure-method",
    "element-4": "build-method",
    "element-5": "format-file",
    "element-6": "format-method",
  };
  const nextElements = Object.fromEntries(Object.entries(exampleIndex.elements).map(([id, element]) => [
    ids[id],
    { ...element, ...(element.parentId === undefined ? {} : {
      parentId: ids[element.parentId],
    }) },
  ]));
  nextElements["new-file"] = { kind: "file", name: "src/new.ts", locations: [] };
  nextElements["new-class"] = { kind: "class", name: "New", parentId: "new-file", locations: [] };
  const nextTree = buildTree({ ...exampleIndex, elements: nextElements });
  const expanded = expandedNodeIds(nextTree, true, expansionStates(previousTree, previousExpanded));

  assert.equal(expanded.has("directory:src/services"), false);
  assert.equal(expanded.has("service-class"), false);
  assert.equal(expanded.has("format-file"), false);
  assert.equal(expanded.has("service-file"), true);
  assert.equal(expanded.has("new-file"), true);
  assert.deepEqual(
    expandedNodeIds(nextTree, true, new Map(JSON.parse(JSON.stringify([...expansionStates(previousTree, previousExpanded)])))),
    expanded,
  );
});

test("does not transfer expansion between indistinguishable duplicate nodes", () => {
  const index = {
    schemaVersion: 1,
    patch: "unused by tree construction",
    elements: {
      "element-1": { kind: "file", name: "src/work.ts", locations: [] },
      "element-2": { kind: "class", name: "Worker", parentId: "element-1", locations: [] },
      "element-3": { kind: "method", name: "run", parentId: "element-2", locations: [] },
      "element-4": { kind: "class", name: "Worker", parentId: "element-1", locations: [] },
      "element-5": { kind: "method", name: "stop", parentId: "element-4", locations: [] },
    },
  };
  const tree = buildTree(index);
  const previousExpanded = expandedNodeIds(tree);
  previousExpanded.delete("element-2");
  const states = expansionStates(tree, previousExpanded);
  const expanded = expandedNodeIds(tree, true, states);

  assert.equal(expanded.has("element-2"), true);
  assert.equal(expanded.has("element-4"), true);
  assert.equal(expanded.has("element-1"), true);
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

test("the annotate-diff viewer finds the newest index under the configured output directory", async (t) => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "diff-viewer-"));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const repositoryDirectory = path.join(directory, "repository");
  const outputDirectory = path.join(repositoryDirectory, "docs", "plans", "feature");
  await mkdir(outputDirectory, { recursive: true });
  const older = path.join(outputDirectory, "older.diff-index.json");
  const newer = path.join(outputDirectory, "newer.diff-index.json");
  await writeFile(older, "{}");
  await writeFile(newer, "{}");
  await utimes(older, new Date(1_000), new Date(1_000));
  await utimes(newer, new Date(2_000), new Date(2_000));
  await mkdir(path.join(repositoryDirectory, "advanced-diff-viewer"));
  await writeFile(path.join(repositoryDirectory, "advanced-diff-viewer/diff-index.json"), "{}");

  const configPath = path.join(toolkitDirectory, "annotate-diff/visualizer/vite.config.mjs");
  assert.equal(await defaultIndexFileName(configPath, repositoryDirectory), "docs/plans/feature/newer.diff-index.json");
});

test("recognizes Alt or Option plus Z as the line-wrapping shortcut", () => {
  assert.equal(isLineWrapShortcut({ altKey: true, ctrlKey: false, metaKey: false, code: "KeyZ" }), true);
  assert.equal(isLineWrapShortcut({ altKey: false, ctrlKey: false, metaKey: false, code: "KeyZ" }), false);
  assert.equal(isLineWrapShortcut({ altKey: true, ctrlKey: false, metaKey: false, code: "KeyX" }), false);
  assert.equal(isLineWrapShortcut({ altKey: true, ctrlKey: true, metaKey: false, code: "KeyZ" }), false);
});

test("keeps the draggable navigation width within usable panel bounds", () => {
  assert.equal(clampSidebarWidth(100, 1200), 240);
  assert.equal(clampSidebarWidth(420, 1200), 420);
  assert.equal(clampSidebarWidth(900, 1200), 640);
  assert.equal(clampSidebarWidth(500, 700), 380);
});
