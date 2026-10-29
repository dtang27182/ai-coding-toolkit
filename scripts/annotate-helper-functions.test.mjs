import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { annotateHelperFunctions } from "../common/impl-dataflow/annotate-helper-functions.mjs";
import { implementationDataflowErrors } from "../common/impl-dataflow/semantic-errors.mjs";

const scriptPath = new URL("../common/impl-dataflow/annotate-helper-functions.mjs", import.meta.url).pathname;

function fn(id, containerId = "owner") {
  return { id, name: id, type: "function", containerId, sourceFile: "src/service.ts", changeType: "unchanged", changeSummary: "N/A", initialization: false };
}

function flow(from, to, transferType = "arguments") {
  return { type: "dataflow", from: { nodeId: from, type: "function" }, to: { nodeId: to, type: "function" }, transferType, dataDescription: "value", purpose: "Process value", changeType: "unchanged" };
}

function graph() {
  return {
    schemaVersion: 18,
    stage: "high-level-design",
    containers: [
      { id: "owner", name: "Service", type: "class", sourceFile: "src/service.ts" },
      { id: "other", name: "OtherService", type: "class", sourceFile: "src/service.ts" },
    ],
    nodes: [fn("parent"), fn("helper"), fn("other-parent", "other")],
    relationships: [],
  };
}

test("records the sole same-container caller across argument and return flows", () => {
  const input = graph();
  input.relationships = [flow("parent", "helper"), flow("parent", "helper"), flow("helper", "parent", "return")];
  const result = annotateHelperFunctions(input);
  assert.equal(result.nodes.find((node) => node.id === "helper").helperOf, "parent");
  assert.equal(result.nodes.find((node) => node.id === "parent").helperOf, undefined);
  assert.deepEqual(result.relationships, input.relationships);
  assert.equal(input.nodes.find((node) => node.id === "helper").helperOf, undefined);
  assert.deepEqual(annotateHelperFunctions(result), result);
});

test("recognizes a caller from a return flow alone", () => {
  const input = graph();
  input.relationships = [flow("helper", "parent", "return")];
  assert.equal(annotateHelperFunctions(input).nodes.find((node) => node.id === "helper").helperOf, "parent");
});

test("does not mark functions with multiple callers, another-container callers, or only self calls", () => {
  const input = graph();
  input.relationships = [flow("parent", "helper"), flow("other-parent", "helper")];
  assert.equal(annotateHelperFunctions(input).nodes.find((node) => node.id === "helper").helperOf, undefined);

  input.relationships = [flow("other-parent", "helper")];
  assert.equal(annotateHelperFunctions(input).nodes.find((node) => node.id === "helper").helperOf, undefined);

  input.relationships = [flow("helper", "helper")];
  assert.equal(annotateHelperFunctions(input).nodes.find((node) => node.id === "helper").helperOf, undefined);
});

test("updates and clears the parent ID when callers change", () => {
  const input = graph();
  input.relationships = [flow("parent", "helper")];
  const annotated = annotateHelperFunctions(input);
  annotated.nodes.push(fn("new-parent"));
  annotated.nodes.find((node) => node.id === "helper").helperOf = "removed-parent";
  annotated.relationships = [flow("new-parent", "helper")];
  const updated = annotateHelperFunctions(annotated);
  assert.equal(updated.nodes.find((node) => node.id === "helper").helperOf, "new-parent");

  updated.relationships = [flow("other-parent", "helper")];
  assert.equal(annotateHelperFunctions(updated).nodes.find((node) => node.id === "helper").helperOf, undefined);
});

test("annotates a code-review graph and leaves missing-from-cr markers unmarked", () => {
  const input = graph();
  input.stage = "code-review";
  input.diffHunks = [];
  input.nodes.push({ ...fn("missing"), subtype: "missing-from-cr", changeType: "added", changeSummary: "Not implemented" });
  input.relationships = [flow("parent", "helper"), flow("parent", "missing")];
  const result = annotateHelperFunctions(input);
  assert.equal(result.nodes.find((node) => node.id === "helper").helperOf, "parent");
  assert.equal(result.nodes.find((node) => node.id === "missing").helperOf, undefined);
});

test("replaces earlier boolean helper markers with parent IDs", () => {
  const input = graph();
  input.nodes.find((node) => node.id === "helper").helper = true;
  input.relationships = [flow("parent", "helper")];
  const result = annotateHelperFunctions(input);
  assert.equal(result.nodes.find((node) => node.id === "helper").helperOf, "parent");
  assert.equal(result.nodes.find((node) => node.id === "helper").helper, undefined);
});

test("validates helper parent references and ownership", () => {
  const input = graph();
  const helper = input.nodes.find((node) => node.id === "helper");
  helper.helperOf = "unknown";
  assert.match(implementationDataflowErrors(input).join("\n"), /Unknown helper parent/);

  helper.helperOf = "helper";
  assert.match(implementationDataflowErrors(input).join("\n"), /another function in the same container/);

  helper.helperOf = "other-parent";
  assert.match(implementationDataflowErrors(input).join("\n"), /another function in the same container/);

  input.nodes.push({ ...fn("state"), type: "state-variable" });
  helper.helperOf = "state";
  assert.match(implementationDataflowErrors(input).join("\n"), /must be a function/);

  helper.helperOf = "parent";
  assert.deepEqual(implementationDataflowErrors(input), []);
});

test("CLI writes annotations and rejects an invalid graph without changing the file", async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "annotate-helper-functions-"));
  const file = path.join(directory, "feature.impl-dataflow.json");
  try {
    const input = graph();
    input.relationships = [flow("parent", "helper")];
    await writeFile(file, JSON.stringify(input));
    const result = spawnSync(process.execPath, [scriptPath, file], { encoding: "utf8" });
    assert.equal(result.status, 0, result.stderr);
    assert.equal(JSON.parse(await readFile(file, "utf8")).nodes.find((node) => node.id === "helper").helperOf, "parent");

    const invalid = { ...input, relationships: [flow("unknown", "helper")] };
    await writeFile(file, JSON.stringify(invalid));
    const rejected = spawnSync(process.execPath, [scriptPath, file], { encoding: "utf8" });
    assert.equal(rejected.status, 1);
    assert.match(rejected.stderr, /Unknown relationship node: unknown/);
    assert.deepEqual(JSON.parse(await readFile(file, "utf8")), invalid);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
