import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { generateEnrichedPatch } from "../common/enriched-patch/generate-enriched-patch.mjs";
import { transferFunctionDiffRanges } from "../enrich-diff/scripts/transfer-function-diff-ranges.mjs";

const scriptPath = new URL("../enrich-diff/scripts/transfer-function-diff-ranges.mjs", import.meta.url).pathname;
const file = "src/service.ts";

function review(patch, names = ["first", "second"]) {
  return {
    schemaVersion: 20,
    stage: "code-review",
    containers: [{ id: "service", name: "Service", type: "class", sourceFile: file }],
    nodes: names.map((name) => ({
      id: name, name, type: "function", containerId: "service", sourceFile: file,
      changeType: "modified", changeSummary: { newBehavior: `Changes ${name}.` },
      initialization: false, diffHunkIds: ["shared"],
    })),
    relationships: [],
    diffHunks: [{ id: "shared", file, patch: patch.slice(patch.indexOf("@@")) }],
  };
}

const patch = [
  `diff --git a/${file} b/${file}`,
  `--- a/${file}`,
  `+++ b/${file}`,
  "@@ -1,8 +1,8 @@",
  " export class Service {",
  "   first() {",
  "-    return 1;",
  "+    return 2;",
  "   }",
  "   second() {",
  "-    return 3;",
  "+    return 4;",
  "   }",
  " }",
].join("\n");

test("copies each method's ranges from a shared file hunk and reruns deterministically", async (t) => {
  const enriched = generateEnrichedPatch(patch);
  const input = review(patch);
  const result = transferFunctionDiffRanges(input, enriched);
  for (const node of result.nodes) {
    const [id, method] = Object.entries(enriched.elements).find(([, element]) => element.kind === "method" && element.name === node.name);
    assert.equal(node.enrichedPatchElementId, id);
    assert.deepEqual(node.locations, method.locations);
    assert.deepEqual(node.changes, method.changes);
  }
  assert.deepEqual(transferFunctionDiffRanges(result, enriched), result);
  assert.equal(input.nodes[0].locations, undefined);

  const directory = await mkdtemp(path.join(os.tmpdir(), "function-diff-ranges-"));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const reviewPath = path.join(directory, "review.json");
  const enrichedPath = path.join(directory, "enriched.json");
  await Promise.all([writeFile(reviewPath, JSON.stringify(input)), writeFile(enrichedPath, JSON.stringify(enriched))]);
  const command = spawnSync(process.execPath, [scriptPath, reviewPath, enrichedPath], { encoding: "utf8" });
  assert.equal(command.status, 0, command.stderr);
  assert.deepEqual(JSON.parse(await readFile(reviewPath, "utf8")), result);
});

test("fails when a changed function has no matching enriched-patch method", () => {
  const input = review(patch, ["first", "missing"]);
  assert.throws(() => transferFunctionDiffRanges(input, generateEnrichedPatch(patch)), /Expected one enriched-patch method.*found 0/);
});

test("copies both sides of a renamed function", () => {
  const renamePatch = [
    `diff --git a/${file} b/${file}`,
    `--- a/${file}`,
    `+++ b/${file}`,
    "@@ -1 +1 @@",
    "-export function oldName() { return 1; }",
    "+export function newName() { return 2; }",
  ].join("\n");
  const owner = { id: "module", name: "service", type: "module", sourceFile: file };
  const node = {
    id: "renamed", name: "newName", type: "function", containerId: "module", sourceFile: file,
    renamedFrom: { name: "oldName", sourceFile: file }, changeType: "modified",
    changeSummary: { newBehavior: "Uses the new name." }, initialization: false, diffHunkIds: ["rename"],
  };
  const plannedNode = { ...node };
  delete plannedNode.diffHunkIds;
  const hld = { schemaVersion: 20, stage: "high-level-design", containers: [owner], nodes: [plannedNode], relationships: [] };
  const enriched = generateEnrichedPatch(renamePatch, hld);
  const input = {
    schemaVersion: 20, stage: "code-review", containers: [owner], nodes: [node], relationships: [],
    diffHunks: [{ id: "rename", file, patch: renamePatch.slice(renamePatch.indexOf("@@")) }],
  };
  const result = transferFunctionDiffRanges(input, enriched);
  const pair = enriched.renames[0];
  assert.equal(result.nodes[0].enrichedPatchElementId, pair.to);
  assert.deepEqual(result.nodes[0].locations, [
    ...enriched.elements[pair.from].locations,
    ...enriched.elements[pair.to].locations,
  ]);
  assert.deepEqual(result.nodes[0].changes, [
    ...enriched.elements[pair.from].changes,
    ...enriched.elements[pair.to].changes,
  ]);
});
