import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, utimes, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";

import { changeBlocks, changeRuns } from "../common/enriched-patch/viewer/src/change-navigation.ts";
import { examplePatch } from "../common/enriched-patch/viewer/src/example.ts";
import { clampSidebarWidth } from "../common/enriched-patch/viewer/src/layout.ts";
import { buildTree, expandedNodeIds, expansionStates, filterTree, statsForElement, unmatchedCount } from "../common/enriched-patch/viewer/src/model.ts";
import { firstChangedLine, parsePatch } from "../common/enriched-patch/viewer/src/patch.ts";
import { isLineWrapShortcut } from "../common/enriched-patch/viewer/src/shortcuts.ts";
import {
  collectChanges,
  elementFilterStates,
  hiddenRowsByFile,
  isChangeHidden,
  rowChanges,
  tagCounts,
} from "../common/enriched-patch/viewer/src/tag-filter.ts";
import { richDiffReferences } from "../enrich-diff/visualizer/src/rich-diff.ts";

const toolkitDirectory = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

async function richDiffPlugins(configPath, repositoryDirectory) {
  const originalDirectory = process.cwd();
  process.chdir(repositoryDirectory);
  try {
    const { default: config } = await import(`${pathToFileURL(configPath).href}?repository=${Date.now()}`);
    return config.plugins;
  } finally {
    process.chdir(originalDirectory);
  }
}

async function pluginResponse(plugin, url) {
  let middleware;
  await plugin.configureServer({ middlewares: { use(handler) { middleware = handler; } } });
  const response = {
    statusCode: 200,
    setHeader() {},
    end(body) { this.body = body; },
  };
  await middleware({ method: "GET", url }, response, () => {
    assert.fail(`No middleware handled ${url}`);
  });
  return response;
}

test("parses complete file rows and change counts from the embedded patch", () => {
  const files = parsePatch(examplePatch.patch);
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
  const files = parsePatch(examplePatch.patch);
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
  const rows = parsePatch(examplePatch.patch)[0].rows;
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

test("keeps file paths when changed content resembles patch headers", () => {
  const files = parsePatch([
    "diff --git a/review.patch b/review.patch",
    "index 1111111..2222222 100644",
    "--- a/review.patch",
    "+++ b/review.patch",
    "@@ -1 +1 @@",
    "--- previous source line",
    "+++ next source line",
  ].join("\n"));
  assert.equal(files[0].path, "review.patch");
  assert.equal(files[0].oldPath, "review.patch");
  assert.equal(files[0].newPath, "review.patch");
  assert.deepEqual(files[0].rows.map(({ kind, text }) => ({ kind, text })), [
    { kind: "delete", text: "-- previous source line" },
    { kind: "add", text: "++ next source line" },
  ]);
});

test("builds directory nodes above indexed files and preserves entity nesting", () => {
  const tree = buildTree(examplePatch);
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
  const tree = buildTree(examplePatch);
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
  const previousTree = buildTree(examplePatch);
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
  const nextElements = Object.fromEntries(Object.entries(examplePatch.elements).map(([id, element]) => [
    ids[id],
    { ...element, ...(element.parentId === undefined ? {} : {
      parentId: ids[element.parentId],
    }) },
  ]));
  nextElements["new-file"] = { kind: "file", name: "src/new.ts", locations: [] };
  nextElements["new-class"] = { kind: "class", name: "New", parentId: "new-file", locations: [] };
  const nextTree = buildTree({ ...examplePatch, elements: nextElements });
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
  const files = parsePatch(examplePatch.patch);
  assert.deepEqual(statsForElement(examplePatch.elements["element-3"], files), {
    added: 1,
    removed: 1,
    changeType: "modified",
  });
  assert.deepEqual(statsForElement(examplePatch.elements["element-6"], files), {
    added: 3,
    removed: 0,
    changeType: "added",
  });
  assert.equal(unmatchedCount(examplePatch.elements["element-1"]), 0);
});

test("counts each tag across every element's changes in schema order", () => {
  const counts = tagCounts(collectChanges(examplePatch)).map(({ tag, count }) => ({ tag, count }));
  assert.deepEqual(counts, [
    { tag: "initialization", count: 1 },
    { tag: "data-plumbing", count: 1 },
  ]);
  assert.deepEqual(tagCounts([]), []);
});

test("hides a change when it carries any hidden tag", () => {
  const change = { oldLines: [1, 1], newLines: null, tags: ["test-code", "initialization"] };
  assert.equal(isChangeHidden(change, new Set()), false);
  assert.equal(isChangeHidden(change, new Set(["initialization"])), true);
  assert.equal(isChangeHidden({ ...change, tags: [] }, new Set(["initialization"])), false);
});

test("hides navigation elements only when every change beneath them is hidden", () => {
  const partial = elementFilterStates(examplePatch, new Set(["initialization"]));
  assert.deepEqual(partial.get("element-3"), { visible: false, totalChanges: 1, hiddenChanges: 1, visibleTags: [] });
  assert.deepEqual(partial.get("element-2"), { visible: true, totalChanges: 2, hiddenChanges: 1, visibleTags: ["data-plumbing"] });
  assert.equal(partial.get("element-1").visible, true);

  const everything = elementFilterStates(examplePatch, new Set(["initialization", "data-plumbing"]));
  assert.equal(everything.get("element-2").visible, false);
  assert.equal(everything.get("element-1").visible, false);
  assert.equal(everything.get("element-6").visible, true, "untagged changes are never hidden");

  const filtered = filterTree(buildTree(examplePatch), (id) => everything.get(id).visible);
  assert.equal(filtered.length, 1);
  assert.deepEqual(filtered[0].children.map((node) => node.name), ["utils"]);
  assert.equal(filtered[0].children[0].children[0].element.name, "src/utils/format.ts");
});

test("maps changed rows to their owning change and leaves hidden rows out of line counts", () => {
  const files = parsePatch(examplePatch.patch);
  const changes = collectChanges(examplePatch);
  assert.deepEqual(rowChanges(files[0], changes).map((change) => change?.elementId), [
    undefined, undefined, "element-3", "element-3", undefined, undefined, undefined,
    "element-4", "element-4", "element-4", undefined, undefined,
  ]);
  const hiddenRows = hiddenRowsByFile(files, changes, new Set(["data-plumbing"]));
  assert.deepEqual(hiddenRows.get("src/services/ChangeService.ts"), [
    false, false, false, false, false, false, false, true, true, true, false, false,
  ]);
  assert.deepEqual(statsForElement(examplePatch.elements["element-1"], files, hiddenRows), { added: 1, removed: 1, changeType: "modified" });
  assert.deepEqual(statsForElement(examplePatch.elements["element-2"], files, hiddenRows), { added: 1, removed: 1, changeType: "modified" });
  assert.deepEqual(statsForElement(examplePatch.elements["element-4"], files, hiddenRows), { added: 0, removed: 0, changeType: "modified" });
});

test("the enrich-diff viewer loads both files through the newest Rich Diff manifest", async (t) => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "enriched-patch-"));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const repositoryDirectory = path.join(directory, "repository");
  const outputDirectory = path.join(repositoryDirectory, "docs", "plans", "feature");
  await mkdir(outputDirectory, { recursive: true });
  const older = path.join(outputDirectory, "older.rich-diff.json");
  const newer = path.join(outputDirectory, "newer.rich-diff.json");
  const enrichedPatch = path.join(directory, "patches", "feature.enriched-patch.json");
  const sysDataflow = path.join(directory, "diagrams", "feature.cr.sys-dataflow.json");
  await mkdir(path.dirname(enrichedPatch));
  await mkdir(path.dirname(sysDataflow));
  await writeFile(enrichedPatch, '{"patch":"example"}');
  await writeFile(sysDataflow, '{"feature":"example"}');
  await writeFile(older, "{}");
  const manifest = { enrichedPatch, sysDataflow };
  await writeFile(newer, JSON.stringify(manifest));
  await utimes(older, new Date(1_000), new Date(1_000));
  await utimes(newer, new Date(2_000), new Date(2_000));

  const configPath = path.join(toolkitDirectory, "enrich-diff/visualizer/vite.config.mjs");
  const plugins = await richDiffPlugins(configPath, repositoryDirectory);
  const defaultResponse = await pluginResponse(plugins[0], "/__rich-diff/default");
  assert.equal(defaultResponse.statusCode, 200);
  assert.equal(JSON.parse(defaultResponse.body).fileName, "docs/plans/feature/newer.rich-diff.json");
  assert.deepEqual(JSON.parse(JSON.parse(defaultResponse.body).contents), manifest);
  assert.equal((await pluginResponse(plugins[1], `/__rich-diff/reference?path=${encodeURIComponent(enrichedPatch)}`)).body, '{"patch":"example"}');
  assert.equal((await pluginResponse(plugins[1], `/__rich-diff/reference?path=${encodeURIComponent(sysDataflow)}`)).body, '{"feature":"example"}');
  assert.equal((await pluginResponse(plugins[1], "/__rich-diff/reference?path=relative.json")).statusCode, 400);
});

test("Rich Diff requires only two absolute JSON paths", () => {
  const manifest = {
    enrichedPatch: "/tmp/feature.enriched-patch.json",
    sysDataflow: "/elsewhere/feature.cr.sys-dataflow.json",
  };
  assert.deepEqual(richDiffReferences(manifest), manifest);
  assert.throws(() => richDiffReferences({ ...manifest, sysDataflow: "feature.cr.sys-dataflow.json" }), /absolute/);
  assert.throws(() => richDiffReferences({ ...manifest, extra: "value" }), /only enrichedPatch and sysDataflow/);
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
