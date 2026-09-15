import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const toolkitDirectory = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const counterPath = path.join(toolkitDirectory, "hld-gen/scripts/count-design-changes.mjs");
const exposureCounterPath = path.join(toolkitDirectory, "hld-gen/scripts/count-variable-exposure.mjs");
const validatorPath = path.join(toolkitDirectory, "hld-gen/scripts/validate-architecture-diff.mjs");

function architectureDiff() {
  const changeTypes = ["added", "modified", "deleted", "unchanged"];
  return {
    schemaVersion: 7,
    stage: "high level design",
    classes: changeTypes.map((changeType) => ({
      name: `Service-${changeType}`,
      hasUserFlowState: changeType === "modified",
      changeType,
      methods: (changeType === "unchanged" ? ["unchanged"] : changeTypes).map(
        (methodChangeType) => ({ name: methodChangeType, userFlow: true, changeType: methodChangeType })
      ),
      variableExposure: [],
      variableExposureCount: 0,
    })),
    components: changeTypes.flatMap((changeType) => [
      { name: `Panel-${changeType}`, type: "ui", userFlow: true, changeType },
      { name: `Endpoint-${changeType}`, type: "external-io", userFlow: true, changeType },
    ]),
    relationships: changeTypes.flatMap((changeType) => [
      {
        from: { component: `Panel-${changeType}` },
        to: { class: "Service-modified", method: "modified" },
        type: "dataflow",
        label: "selected item",
        userFlow: true,
        changeType,
      },
      {
        from: { class: "Service-modified", method: "modified" },
        to: { class: "Service-modified" },
        type: "state-update",
        label: "selection: update the selected item",
        userFlow: true,
        changeType,
      },
      {
        from: { class: "Service-modified" },
        to: { class: "Service-unchanged" },
        type: "composition",
        changeType,
      },
    ]),
    variableExposureCount: 0,
  };
}

async function runCounter(t, input) {
  const directory = await mkdtemp(path.join(os.tmpdir(), "design-changes-test-"));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const inputPath = path.join(directory, "design.json");
  await writeFile(inputPath, JSON.stringify(input));
  return { ...spawnSync(process.execPath, [counterPath, inputPath], { encoding: "utf8" }), inputPath };
}

test("counts changed entries by rubric scope and excludes unchanged entries and composition", async (t) => {
  const input = architectureDiff();
  for (const method of input.classes[0].methods) method.userFlow = false;
  input.components[0].userFlow = false;
  input.relationships[0].userFlow = false;
  const result = await runCounter(t, input);
  assert.equal(result.status, 0, result.stderr);
  const expected = {
    ...input,
    changedClassCount: 3,
    changedMethodCount: 9,
    changedComponentCount: 6,
    changedDataflowRelationshipCount: 3,
    changedStateUpdateRelationshipCount: 3,
  };
  assert.deepEqual(JSON.parse(await readFile(result.inputPath, "utf8")), expected);

  for (const scriptPath of [validatorPath, exposureCounterPath]) {
    const compatibility = spawnSync(process.execPath, [scriptPath, result.inputPath], { encoding: "utf8" });
    assert.equal(compatibility.status, 0, compatibility.stderr);
  }
  assert.deepEqual(JSON.parse(await readFile(result.inputPath, "utf8")), expected);
});

test("writes zero for empty change sets without replacing unknown exposure with zero", async (t) => {
  const input = {
    schemaVersion: 7,
    stage: "high level design",
    classes: [{ name: "Context", hasUserFlowState: false, changeType: "unchanged", methods: [], variableExposure: null }],
    components: [],
    relationships: [],
    variableExposureCount: null,
  };
  const result = await runCounter(t, input);
  assert.equal(result.status, 0, result.stderr);
  assert.deepEqual(JSON.parse(await readFile(result.inputPath, "utf8")), {
    ...input,
    changedClassCount: 0,
    changedMethodCount: 0,
    changedComponentCount: 0,
    changedDataflowRelationshipCount: 0,
    changedStateUpdateRelationshipCount: 0,
  });
});

test("refreshes all counts after design changes and produces stable results on repeat runs", async (t) => {
  const result = await runCounter(t, architectureDiff());
  assert.equal(result.status, 0, result.stderr);
  const updated = JSON.parse(await readFile(result.inputPath, "utf8"));
  updated.classes[0].changeType = "unchanged";
  for (const method of updated.classes[0].methods) {
    method.changeType = "unchanged";
  }
  updated.components[0].changeType = "unchanged";
  updated.relationships[0].changeType = "unchanged";
  updated.relationships[1].changeType = "unchanged";
  await writeFile(result.inputPath, JSON.stringify(updated));
  const expected = {
    ...updated,
    changedClassCount: 2,
    changedMethodCount: 6,
    changedComponentCount: 5,
    changedDataflowRelationshipCount: 2,
    changedStateUpdateRelationshipCount: 2,
  };
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const rerun = spawnSync(process.execPath, [counterPath, result.inputPath], { encoding: "utf8" });
    assert.equal(rerun.status, 0, rerun.stderr);
    assert.deepEqual(JSON.parse(await readFile(result.inputPath, "utf8")), expected);
  }
});

test("rejects invalid architecture diffs and derived counts without changing the file", async (t) => {
  const invalidChange = architectureDiff();
  invalidChange.classes[0].changeType = "unknown";
  const invalidEndpoint = architectureDiff();
  invalidEndpoint.relationships[0].from = { component: "Missing panel" };
  const invalidCount = architectureDiff();
  invalidCount.changedClassCount = -1;
  for (const input of [invalidChange, invalidEndpoint, invalidCount]) {
    const result = await runCounter(t, input);
    assert.notEqual(result.status, 0);
    assert.equal(await readFile(result.inputPath, "utf8"), JSON.stringify(input));
  }
});

test("rejects changed methods in unchanged classes before validating or counting", async (t) => {
  for (const changeType of ["added", "modified", "deleted"]) {
    const input = architectureDiff();
    input.classes.push({
      name: "InvalidContext",
      hasUserFlowState: false,
      changeType: "unchanged",
      methods: [{ name: "run", userFlow: true, changeType }],
      variableExposure: [],
    });
    const result = await runCounter(t, input);
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /Unchanged class has changed method: InvalidContext.run/);
    assert.equal(await readFile(result.inputPath, "utf8"), JSON.stringify(input));

    for (const scriptPath of [validatorPath, exposureCounterPath]) {
      const rejected = spawnSync(process.execPath, [scriptPath, result.inputPath], { encoding: "utf8" });
      assert.notEqual(rejected.status, 0);
      assert.match(rejected.stderr, /Unchanged class has changed method: InvalidContext.run/);
      assert.equal(await readFile(result.inputPath, "utf8"), JSON.stringify(input));
    }
  }
});
