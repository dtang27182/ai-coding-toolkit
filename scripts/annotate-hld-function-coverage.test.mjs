import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import Ajv2020 from "ajv/dist/2020.js";

import { generateEnrichedPatch } from "../common/enriched-patch/generate-enriched-patch.mjs";
import { filterGraph } from "../common/impl-dataflow/visualizer/src/filter.ts";
import { annotateHldFunctionCoverage } from "../enrich-diff/scripts/annotate-hld-function-coverage.mjs";
import { changeOwnershipErrors } from "../enrich-diff/scripts/validate-enriched-patch.mjs";

const tag = "hld-change-mismatch";
const scriptPath = new URL("../enrich-diff/scripts/annotate-hld-function-coverage.mjs", import.meta.url).pathname;

function patchFor(rows, oldFile = "src/service.ts", newFile = oldFile) {
  const oldCount = rows.filter((row) => !row.startsWith("+")).length;
  const newCount = rows.filter((row) => !row.startsWith("-")).length;
  return [
    `diff --git a/${oldFile ?? newFile} b/${newFile ?? oldFile}`,
    `--- ${oldFile === null ? "/dev/null" : `a/${oldFile}`}`,
    `+++ ${newFile === null ? "/dev/null" : `b/${newFile}`}`,
    `@@ -${oldCount === 0 ? 0 : 1},${oldCount} +${newCount === 0 ? 0 : 1},${newCount} @@`,
    ...rows,
  ].join("\n");
}

function graph(stage, nodes = [], containers = [{ id: "owner", name: "src/service.ts", type: "module" }]) {
  return { schemaVersion: 17, stage, nodes, containers, relationships: [], ...(stage === "code-review" ? { diffHunks: [] } : {}) };
}

function fn(id, name, changeType, sourceFile = "src/service.ts", containerId = "owner") {
  return { id, name, type: "function", sourceFile, containerId, changeType, initialization: false };
}

function addEvidence(review, patch) {
  review.diffHunks.push({ id: "evidence", file: "src/service.ts", patch: patch.slice(patch.indexOf("@@")) });
  for (const node of review.nodes) node.diffHunkIds = ["evidence"];
}

const patches = {
  added: patchFor(["+export function run() { return 1; }"]),
  modified: patchFor([" export function run() {", "-  return 1;", "+  return 2;", " }"]),
  deleted: patchFor(["-export function run() { return 1; }"]),
  unchanged: patchFor([" export function run() { return 1; }", "-export const flag = 1;", "+export const flag = 2;"]),
};

test("computes actual statuses and compares all HLD status combinations by container name", () => {
  for (const [actual, patch] of Object.entries(patches)) {
    for (const planned of ["added", "modified", "deleted", "unchanged", undefined]) {
      const hld = graph("high-level-design", planned === undefined ? [] : [fn("planned-run", "run", planned, "src/service.ts", "design-owner")], [{ id: "design-owner", name: "src/service.ts", type: "module" }]);
      const review = graph("code-review", [fn("review-run", "run", "modified")]);
      if (actual !== "unchanged") addEvidence(review, patch);
      const enriched = generateEnrichedPatch(patch);
      const originalReview = structuredClone(review);
      const originalPatch = structuredClone(enriched);
      const result = annotateHldFunctionCoverage(hld, review, patch, enriched);
      const mismatch = planned === undefined ? actual !== "unchanged" : actual !== planned;
      assert.equal(result.codeReview.nodes[0].changeType, actual);
      assert.equal(result.codeReview.nodes[0][tag], mismatch, `${planned} -> ${actual}`);
      assert.equal(result.codeReview.nodes[0].hldChangeType, planned ?? null);
      for (const [id, element] of Object.entries(result.enrichedPatch.elements)) {
        if (element.kind === "method") assert.equal(element.tags?.includes(tag) ?? false, mismatch);
        assert.deepEqual(element.changes, originalPatch.elements[id].changes);
      }
      assert.deepEqual(result.codeReview.diffHunks, review.diffHunks);
      assert.deepEqual(result.codeReview.nodes[0].diffHunkIds, review.nodes[0].diffHunkIds);
      assert.equal(result.enrichedPatch.patch, patch);
      assert.deepEqual(changeOwnershipErrors(result.enrichedPatch), []);
      assert.deepEqual(review, originalReview);
      assert.deepEqual(enriched, originalPatch);
    }
  }
});

test("refreshes the HLD status on reruns when the planned function changes or disappears", () => {
  const review = graph("code-review", [fn("actual", "run", "modified")]);
  addEvidence(review, patches.modified);
  const enriched = generateEnrichedPatch(patches.modified);
  const first = annotateHldFunctionCoverage(graph("high-level-design", [fn("planned", "run", "added")]), review, patches.modified, enriched);
  assert.equal(first.codeReview.nodes[0].hldChangeType, "added");
  const matching = annotateHldFunctionCoverage(graph("high-level-design", [fn("planned", "run", "modified")]), first.codeReview, patches.modified, first.enrichedPatch);
  assert.equal(matching.codeReview.nodes[0].hldChangeType, "modified");
  assert.equal(matching.codeReview.nodes[0][tag], false);
  const absent = annotateHldFunctionCoverage(graph("high-level-design"), matching.codeReview, patches.modified, matching.enrichedPatch);
  assert.equal(absent.codeReview.nodes[0].hldChangeType, null);
  assert.equal(absent.codeReview.nodes[0][tag], true);
});

test("classifies whole methods, arrow functions and unchanged functions in a mixed hunk", () => {
  const patch = patchFor([
    " export class Service {",
    "   run() {",
    "-    const value = 1;",
    "     return 2;",
    "   }",
    "   stable() { return 3; }",
    "-  removed() { return 4; }",
    "+  added = () => 5;",
    " }",
    " export class Other { run() { return 6; } }",
  ]);
  const containers = [{ id: "owner", name: "Service", type: "class" }, { id: "other", name: "Other", type: "class" }];
  const review = graph("code-review", [fn("run", "run", "added"), fn("removed", "removed", "added"), fn("added", "added", "deleted")], containers);
  addEvidence(review, patch);
  review.nodes.push(fn("stable", "stable", "modified"), fn("other-run", "run", "modified", "src/service.ts", "other"));
  const hld = graph("high-level-design", [fn("planned-run", "run", "modified"), fn("planned-removed", "removed", "modified"), fn("planned-added", "added", "added")], containers);
  const enriched = generateEnrichedPatch(patch);
  for (const element of Object.values(enriched.elements)) {
    for (const change of element.changes) change.tags = ["initialization"];
  }
  const result = annotateHldFunctionCoverage(hld, review, patch, enriched);
  assert.deepEqual(result.codeReview.nodes.map((node) => [node.name, node.changeType, node[tag]]), [
    ["run", "modified", false], ["removed", "deleted", true], ["added", "added", false], ["stable", "unchanged", false], ["run", "unchanged", false],
  ]);
  const methods = Object.values(result.enrichedPatch.elements).filter((element) => element.kind === "method");
  assert.deepEqual(methods.filter((element) => element.tags?.includes(tag)).map((element) => element.name), ["removed"]);
  assert.deepEqual(Object.values(result.enrichedPatch.elements).map((element) => element.changes), Object.values(enriched.elements).map((element) => element.changes));
});

test("keeps class-method and standalone-function mismatches separate when owner names coincide", () => {
  const patch = patchFor([
    "-export function run() { return 1; }",
    "+export function run() { return 2; }",
    "-export class Service { run() { return 3; } }",
    "+export class Service { run() { return 4; } }",
  ]);
  for (const type of ["class", "module"]) {
    for (const missing of [false, true]) {
      const containers = [{ id: "owner", name: "Service", type }];
      const hld = graph("high-level-design", [fn("planned", "run", "added")], containers);
      const review = graph("code-review", missing ? [] : [fn("actual", "run", "modified")], containers);
      if (!missing) addEvidence(review, patch);
      const result = annotateHldFunctionCoverage(hld, review, patch, generateEnrichedPatch(patch));
      const methods = Object.values(result.enrichedPatch.elements).filter((element) => element.kind === "method");
      assert.equal(methods.length, 2);
      for (const method of methods) {
        const parent = result.enrichedPatch.elements[method.parentId];
        assert.equal(method.tags?.includes(tag) ?? false, parent.kind === (type === "class" ? "class" : "file"));
      }
    }
  }
});

test("leaves functions in files absent from the patch unchanged", () => {
  const review = graph("code-review", [fn("unaffected", "run", "added", "src/unaffected.ts")]);
  const hld = graph("high-level-design", [fn("planned", "run", "modified", "src/unaffected.ts")]);
  const result = annotateHldFunctionCoverage(hld, review, patches.modified, generateEnrichedPatch(patches.modified));
  assert.equal(result.codeReview.nodes[0].changeType, "unchanged");
  assert.equal(result.codeReview.nodes[0][tag], true);
});

test("treats function renames and file moves as deletion and addition of distinct identifiers", () => {
  const patch = patchFor(["-export function oldName() { return 1; }", "+export function newName() { return 2; }"], "src/old.ts", "src/new.ts");
  const review = graph("code-review", [fn("old", "oldName", "modified", "src/old.ts"), fn("new", "newName", "modified", "src/new.ts")]);
  addEvidence(review, patch);
  const hld = graph("high-level-design", [fn("planned-old", "oldName", "deleted", "src/old.ts"), fn("planned-new", "newName", "added", "src/new.ts")]);
  const result = annotateHldFunctionCoverage(hld, review, patch, generateEnrichedPatch(patch));
  assert.deepEqual(result.codeReview.nodes.map((node) => node.changeType), ["deleted", "added"]);
  assert.ok(result.codeReview.nodes.every((node) => node.tags === undefined));
});

test("distinguishes same-named functions in different files", () => {
  const otherPatch = patchFor(["+export function run() { return 2; }"], "src/other.ts");
  const patch = `${patches.modified}\n${otherPatch}`;
  const review = graph("code-review", [fn("service", "run", "added"), fn("other", "run", "modified", "src/other.ts")]);
  addEvidence(review, patch);
  const hld = graph("high-level-design", [fn("planned-service", "run", "modified"), fn("planned-other", "run", "modified", "src/other.ts")]);
  const result = annotateHldFunctionCoverage(hld, review, patch, generateEnrichedPatch(patch));
  assert.deepEqual(result.codeReview.nodes.map((node) => [node.changeType, node[tag]]), [["modified", false], ["added", true]]);
  assert.deepEqual(Object.values(result.enrichedPatch.elements).filter((element) => element.tags?.includes(tag)).map((element) => element.locations[0].file), ["src/other.ts"]);
});

test("annotates a function moved between files using either CR source path", () => {
  const patch = patchFor(["-export function run() { return 1; }", "+export function run() { return 2; }"], "src/old.ts", "src/new.ts");
  const review = graph("code-review", [fn("old", "run", "modified", "src/old.ts"), fn("new", "run", "modified", "src/new.ts")]);
  addEvidence(review, patch);
  const hld = graph("high-level-design", [fn("planned-old", "run", "deleted", "src/old.ts"), fn("planned-new", "run", "modified", "src/new.ts")]);
  const result = annotateHldFunctionCoverage(hld, review, patch, generateEnrichedPatch(patch));
  assert.deepEqual(result.codeReview.nodes.map((node) => node[tag]), [false, true]);
  const methods = Object.values(result.enrichedPatch.elements).filter((element) => element.kind === "method");
  assert.equal(methods.length, 1);
  assert.deepEqual(methods[0].tags, [tag]);
  assert.deepEqual(methods[0].changes, Object.values(generateEnrichedPatch(patch).elements).find((element) => element.kind === "method").changes);
});

test("keeps a missing addition separate from a same-named deletion in a moved file", () => {
  const patch = patchFor(["-export function run() { return 1; }", "+export function other() { return 2; }"], "src/old.ts", "src/new.ts");
  const review = graph("code-review", [fn("old", "run", "modified", "src/old.ts"), fn("new", "other", "modified", "src/new.ts")]);
  addEvidence(review, patch);
  const hld = graph("high-level-design", [fn("planned-old", "run", "deleted", "src/old.ts"), fn("planned-new", "other", "added", "src/new.ts"), fn("missing", "run", "added", "src/new.ts")]);
  const result = annotateHldFunctionCoverage(hld, review, patch, generateEnrichedPatch(patch));
  assert.equal(result.codeReview.nodes.find((node) => node.subtype === "missing-from-cr")[tag], true);
  assert.ok(Object.values(result.enrichedPatch.elements).every((element) => !element.tags?.includes(tag)));
});

test("adds missing function subtypes with local ownership and tags existing patch functions", () => {
  for (const planned of ["added", "modified", "deleted", "unchanged"]) {
    const hld = graph("high-level-design", [fn("planned", "run", planned)]);
    const review = graph("code-review", [], []);
    review.changedClassCount = 0;
    review.changedFunctionCount = 0;
    const result = annotateHldFunctionCoverage(hld, review, patches.modified, generateEnrichedPatch(patches.modified));
    if (planned === "unchanged") {
      assert.deepEqual(result.codeReview.nodes, []);
      assert.deepEqual(result.codeReview.containers, []);
    } else if (["added", "modified", "deleted"].includes(planned)) {
      assert.equal(result.codeReview.nodes.length, 1);
      assert.equal(result.codeReview.containers.length, 1);
      assert.equal(result.codeReview.nodes[0].subtype, "missing-from-cr");
      assert.equal(result.codeReview.nodes[0].changeType, planned);
      assert.equal(result.codeReview.nodes[0].diffHunkIds, undefined);
      assert.equal(result.codeReview.nodes[0].containerId, result.codeReview.containers[0].id);
      assert.equal(result.codeReview.containers[0].name, hld.containers[0].name);
      assert.equal(result.codeReview.nodes[0][tag], true);
      assert.ok(Object.values(result.enrichedPatch.elements).find((element) => element.kind === "method").tags.includes(tag));
      const visible = filterGraph(result.codeReview, true, false);
      assert.deepEqual(visible.containers, []);
      assert.deepEqual(visible.missingFunctions, result.codeReview.nodes);
    }
    assert.deepEqual(annotateHldFunctionCoverage(hld, result.codeReview, patches.modified, result.enrichedPatch), result);
  }
});

test("reuses shared containers and stable missing nodes, then removes obsolete generated entries", () => {
  const hld = graph("high-level-design", [fn("first", "first", "added"), fn("second", "second", "deleted")]);
  const initial = annotateHldFunctionCoverage(hld, graph("code-review", [], []), patches.modified, generateEnrichedPatch(patches.modified));
  assert.equal(initial.codeReview.containers.length, 1);
  assert.equal(new Set([...initial.codeReview.nodes, ...initial.codeReview.containers].map((entry) => entry.id)).size, 3);
  const rerun = annotateHldFunctionCoverage(hld, initial.codeReview, patches.modified, initial.enrichedPatch);
  assert.deepEqual(rerun, initial);
  hld.nodes = [];
  const cleared = annotateHldFunctionCoverage(hld, rerun.codeReview, patches.modified, rerun.enrichedPatch);
  assert.deepEqual(cleared.codeReview.nodes, []);
  assert.deepEqual(cleared.codeReview.containers, []);
});

test("replaces a missing marker when an actual review function is supplied and clears stale tags", () => {
  const hld = graph("high-level-design", [fn("planned", "run", "modified")]);
  const initial = annotateHldFunctionCoverage(hld, graph("code-review"), patches.modified, generateEnrichedPatch(patches.modified));
  const review = structuredClone(initial.codeReview);
  review.nodes.push({ ...fn("actual", "run", "added"), diffHunkIds: ["evidence"] });
  review.diffHunks.push({ id: "evidence", file: "src/service.ts", patch: patches.modified.slice(patches.modified.indexOf("@@")) });
  const result = annotateHldFunctionCoverage(hld, review, patches.modified, initial.enrichedPatch);
  assert.equal(result.codeReview.nodes.length, 1);
  assert.equal(result.codeReview.nodes[0].id, "actual");
  assert.equal(result.codeReview.nodes[0].changeType, "modified");
  assert.equal(result.codeReview.nodes[0].hldChangeType, "modified");
  assert.equal(result.codeReview.nodes[0][tag], false);
  assert.ok(Object.values(result.enrichedPatch.elements).every((element) => !element.tags?.includes(tag)));
});

test("flags a renamed module container without confusing its missing marker with an actual function", () => {
  const hld = graph("high-level-design", [fn("planned", "run", "modified")], [{ id: "owner", name: "old-module", type: "module" }]);
  const review = graph("code-review", [fn("actual", "run", "added")], [{ id: "owner", name: "new-module", type: "module" }]);
  addEvidence(review, patches.modified);
  const result = annotateHldFunctionCoverage(hld, review, patches.modified, generateEnrichedPatch(patches.modified));
  assert.equal(result.codeReview.nodes.length, 2);
  assert.deepEqual(result.codeReview.nodes.map((node) => node[tag]), [true, true]);
  assert.equal(result.codeReview.nodes[1].subtype, "missing-from-cr");
  assert.deepEqual(Object.values(result.enrichedPatch.elements).find((element) => element.kind === "method").tags, [tag]);
});

test("preserves nonfunction nodes, relationships, containers and patch change entries", () => {
  const review = graph("code-review", [fn("run", "run", "deleted")]);
  addEvidence(review, patches.modified);
  review.containers[0].diffHunkIds = ["evidence"];
  review.nodes.push({ id: "state", name: "state", type: "state-variable", containerId: "owner", initialization: false, changeType: "added", diffHunkIds: ["evidence"] });
  review.relationships.push({ from: { nodeId: "run", type: "function" }, to: { nodeId: "state", type: "state-variable" }, type: "dataflow", changeType: "added", diffHunkIds: ["evidence"], dataDescription: "Result", purpose: "Retain result" });
  const enriched = generateEnrichedPatch(patches.modified);
  const result = annotateHldFunctionCoverage(graph("high-level-design"), review, patches.modified, enriched);
  assert.deepEqual(result.codeReview.nodes[1], review.nodes[1]);
  assert.deepEqual(result.codeReview.relationships, review.relationships);
  assert.deepEqual(result.codeReview.containers, review.containers);
  assert.deepEqual(result.codeReview.diffHunks, review.diffHunks);
  assert.deepEqual(Object.values(result.enrichedPatch.elements).map((element) => element.changes), Object.values(enriched.elements).map((element) => element.changes));
});

test("missing-function markers store planned changeType without evidence and are code-review-only", async () => {
  const patch = patchFor([" export class Service {", "-  run() { return 1; }", "+  run() { return 2; }", " }"]);
  const hld = graph("high-level-design", [fn("planned", "run", "modified")], [{ id: "owner", name: "Service", type: "class" }]);
  const result = annotateHldFunctionCoverage(hld, graph("code-review", [], []), patch, generateEnrichedPatch(patch));
  assert.deepEqual(result.codeReview.relationships, []);
  assert.equal(Object.values(result.enrichedPatch.elements).find((element) => element.kind === "method").tags[0], tag);
  const validate = new Ajv2020({ allErrors: true, strictTypes: true }).compile(JSON.parse(await readFile(new URL("../common/impl-dataflow/impl-dataflow.schema.json", import.meta.url), "utf8")));
  assert.equal(validate(result.codeReview), true, JSON.stringify(validate.errors));
  assert.equal(result.codeReview.nodes[0].changeType, "modified");
  for (const extra of [{ changeType: "unchanged" }, { diffHunkIds: ["evidence"] }, { expectedChangeType: "modified" }, { hldChangeType: "added" }, { tags: [tag] }, { [tag]: "true" }]) {
    const invalid = structuredClone(result.codeReview);
    Object.assign(invalid.nodes[0], extra);
    assert.equal(validate(invalid), false, JSON.stringify(extra));
  }
  const invalidHld = structuredClone(result.codeReview);
  invalidHld.stage = "high-level-design";
  delete invalidHld.diffHunks;
  assert.equal(validate(invalidHld), false);
});

test("CR functions support an optional mismatch boolean rather than a tags array", async () => {
  const validate = new Ajv2020({ allErrors: true, strictTypes: true }).compile(JSON.parse(await readFile(new URL("../common/impl-dataflow/impl-dataflow.schema.json", import.meta.url), "utf8")));
  const review = graph("code-review", [fn("run", "run", "unchanged")]);
  assert.equal(validate(review), true, JSON.stringify(validate.errors));
  for (const value of ["added", "modified", "deleted", "unchanged", null]) {
    review.nodes[0].hldChangeType = value;
    assert.equal(validate(review), true, JSON.stringify(validate.errors));
  }
  review.nodes[0].hldChangeType = "absent";
  assert.equal(validate(review), false);
  delete review.nodes[0].hldChangeType;
  for (const value of [false, true]) {
    review.nodes[0][tag] = value;
    assert.equal(validate(review), true, JSON.stringify(validate.errors));
  }
  for (const value of ["true", [], null]) {
    review.nodes[0][tag] = value;
    assert.equal(validate(review), false, JSON.stringify(value));
  }
  delete review.nodes[0][tag];
  review.nodes[0].tags = [tag];
  assert.equal(validate(review), false);
});

test("reports unsupported, ambiguous and missing declarations rather than guessing", () => {
  const cases = [
    [patchFor(["-def run(): pass", "+def run(): return 1"], "src/service.py"), "src/service.py", /Unsupported source file/],
    [patchFor([" export function run() {}", "+export function run() {}"]), "src/service.ts", /Ambiguous function declaration/],
    [patchFor(["-export const x = 1;", "+export const x = 2;"]), "src/service.ts", /Function absent from patch source/],
  ];
  for (const [patch, file, error] of cases) {
    const review = graph("code-review", [fn("run", "run", "unchanged", file)]);
    assert.throws(() => annotateHldFunctionCoverage(graph("high-level-design"), review, patch, generateEnrichedPatch(patch)), error);
  }
});

test("reports evidence conflicts without modifying supplied graph data", () => {
  const review = graph("code-review", [fn("run", "run", "modified")]);
  addEvidence(review, patches.unchanged);
  const original = structuredClone(review);
  assert.throws(() => annotateHldFunctionCoverage(graph("high-level-design"), review, patches.unchanged, generateEnrichedPatch(patches.unchanged)), /CR implementation dataflow does not match its schema/);
  assert.deepEqual(review, original);
});

test("CLI updates both artifacts and leaves them untouched when computation fails", async (t) => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "hld-function-coverage-"));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const hldPath = path.join(directory, "feature.impl-dataflow.json");
  const reviewPath = path.join(directory, "feature.cr.impl-dataflow.json");
  const patchPath = path.join(directory, "feature.patch");
  const enrichedPath = path.join(directory, "feature.enriched-patch.json");
  const review = graph("code-review", [fn("actual", "run", "deleted")]);
  addEvidence(review, patches.modified);
  await Promise.all([
    writeFile(hldPath, JSON.stringify(graph("high-level-design", [fn("planned", "run", "unchanged")]))),
    writeFile(reviewPath, JSON.stringify(review)),
    writeFile(patchPath, patches.modified),
    writeFile(enrichedPath, JSON.stringify(generateEnrichedPatch(patches.modified))),
  ]);
  const args = [scriptPath, hldPath, reviewPath, patchPath, "--enriched-patch", enrichedPath];
  const result = spawnSync(process.execPath, args, { encoding: "utf8" });
  assert.equal(result.status, 0, result.stderr);
  const annotatedReview = JSON.parse(await readFile(reviewPath, "utf8"));
  assert.equal(annotatedReview.nodes[0].changeType, "modified");
  assert.equal(annotatedReview.nodes[0][tag], true);
  assert.ok(Object.values(JSON.parse(await readFile(enrichedPath, "utf8")).elements).some((element) => element.tags?.includes(tag)));

  await writeFile(patchPath, patchFor(["-export const value = 1;", "+export const value = 2;"]));
  const beforeReview = await readFile(reviewPath, "utf8");
  const beforePatch = await readFile(enrichedPath, "utf8");
  const failed = spawnSync(process.execPath, args, { encoding: "utf8" });
  assert.equal(failed.status, 1);
  assert.match(failed.stderr, /Function absent from patch source/);
  assert.equal(await readFile(reviewPath, "utf8"), beforeReview);
  assert.equal(await readFile(enrichedPath, "utf8"), beforePatch);
});
