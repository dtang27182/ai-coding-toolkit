import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { filterGraph } from "../hld-gen-new/visualizer/src/filter.ts";

const toolkitDirectory = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const validatorPath = path.join(toolkitDirectory, "hld-gen-new/scripts/validate-architecture-diff.mjs");
const exposureCounterPath = path.join(toolkitDirectory, "hld-gen-new/scripts/count-variable-exposure.mjs");
const changeCounterPath = path.join(toolkitDirectory, "hld-gen-new/scripts/count-design-changes.mjs");

function codeReview() {
  return {
    schemaVersion: 10,
    stage: "code-review",
    classes: [{
      name: "Service",
      changeType: "unchanged",
      methods: [{ name: "inspect", changeType: "unchanged" }],
      stateVariables: [],
    }],
    components: [],
    relationships: [],
  };
}

async function runValidator(t, input, ...argumentsList) {
  const directory = await mkdtemp(path.join(os.tmpdir(), "hld-gen-new validation "));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const inputPath = path.join(directory, "input.arch-diff.json");
  await writeFile(inputPath, `${JSON.stringify(input, null, 2)}\n`);
  return {
    inputPath,
    result: spawnSync(process.execPath, [validatorPath, ...argumentsList, inputPath], { encoding: "utf8" }),
  };
}

test("code-review arch diffs omit HLD-only fields", async (t) => {
  const input = codeReview();
  const { result } = await runValidator(t, input);
  assert.equal(result.status, 0, result.stderr);

  const graph = filterGraph(input, true, false);
  assert.equal(graph.classes[0].variableExposure, null);
  assert.equal(graph.variableExposureCount, null);
});

test("high-level-design validation requires HLD fields", async (t) => {
  const input = codeReview();
  input.stage = "high-level-design";
  input.classes[0].stateVariables.push({ name: "value", changeType: "unchanged" });
  input.components.push({ name: "Panel", type: "ui", changeType: "unchanged" });
  input.relationships.push({
    from: { component: "Panel" },
    to: { class: "Service", method: "inspect" },
    type: "dataflow",
    changeType: "unchanged",
    dataDescription: "request",
    purpose: "Inspect the service",
  });

  const { result } = await runValidator(t, input);
  assert.equal(result.status, 1);
  assert.match(result.stderr, /requires userFlows/);
  assert.match(result.stderr, /requires variableExposure/);
  assert.match(result.stderr, /method requires userFlow/);
  assert.match(result.stderr, /state variable requires userFlow/);
  assert.match(result.stderr, /component requires userFlow/);
  assert.match(result.stderr, /relationship requires userFlow/);
});

test("generic validation rejects invalid architecture references and changes", async (t) => {
  const duplicate = codeReview();
  duplicate.components.push({ name: "Service", type: "external-io", changeType: "unchanged" });
  const duplicateResult = await runValidator(t, duplicate);
  assert.equal(duplicateResult.result.status, 1);
  assert.match(duplicateResult.result.stderr, /Duplicate class or component name/);

  const unknownEndpoint = codeReview();
  unknownEndpoint.relationships.push({
    from: { class: "Service", method: "inspect" },
    to: { component: "Missing" },
    type: "dataflow",
    changeType: "unchanged",
    dataDescription: "result",
    purpose: "Return the inspection result",
  });
  const endpointResult = await runValidator(t, unknownEndpoint);
  assert.equal(endpointResult.result.status, 1);
  assert.match(endpointResult.result.stderr, /Unknown relationship component/);

  const changedMember = codeReview();
  changedMember.classes[0].methods[0].changeType = "modified";
  const memberResult = await runValidator(t, changedMember);
  assert.equal(memberResult.result.status, 1);

  const malformedStateRead = codeReview();
  malformedStateRead.classes[0].changeType = "modified";
  malformedStateRead.classes[0].stateVariables.push({ name: "value", changeType: "modified" });
  malformedStateRead.relationships.push({
    from: { class: "Service", method: "inspect" },
    to: { class: "Service", stateVariable: "value" },
    type: "state-read",
    changeType: "modified",
    dataDescription: "value",
    purpose: "Read the value",
  });
  const stateReadResult = await runValidator(t, malformedStateRead);
  assert.equal(stateReadResult.result.status, 1);
});

test("evaluated validation requires complete HLD metrics", async (t) => {
  const example = JSON.parse(await readFile(
    path.join(toolkitDirectory, "hld-gen-new/references/arch-diff.example.json"),
    "utf8"
  ));
  const pending = await runValidator(t, example, "--evaluated");
  assert.equal(pending.result.status, 1);
  assert.match(pending.result.stderr, /requires non-null changedClassCount/);

  const exposureCount = spawnSync(process.execPath, [exposureCounterPath, pending.inputPath], { encoding: "utf8" });
  assert.equal(exposureCount.status, 0, exposureCount.stderr);
  const changeCount = spawnSync(process.execPath, [changeCounterPath, pending.inputPath], { encoding: "utf8" });
  assert.equal(changeCount.status, 0, changeCount.stderr);
  const evaluated = spawnSync(process.execPath, [validatorPath, "--evaluated", pending.inputPath], { encoding: "utf8" });
  assert.equal(evaluated.status, 0, evaluated.stderr);
});
