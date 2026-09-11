import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const toolkitDirectory = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const validatorPath = path.join(toolkitDirectory, "hld-gen/scripts/validate-architecture-diff.mjs");
const counterPath = path.join(toolkitDirectory, "hld-gen/scripts/count-variable-exposure.mjs");

function variable(name, kind, line, method) {
  return { name, kind, method, declaredAt: { file: "src/Service.js", line, column: 1 } };
}

function architectureDiff(variableExposure) {
  return {
    schemaVersion: 2,
    stage: "high level design",
    classes: [{ name: "Service", changeType: "modified", methods: [], variableExposure }],
    relationships: [],
  };
}

async function runScript(t, input, scriptPath) {
  const directory = await mkdtemp(path.join(os.tmpdir(), "variable-exposure-test-"));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const inputPath = path.join(directory, "design.json");
  await writeFile(inputPath, JSON.stringify(input));
  return { ...spawnSync(process.execPath, [scriptPath, inputPath], { encoding: "utf8" }), inputPath };
}

test("counts distinct declarations from all changed methods and shared instance fields", async (t) => {
  const fields = [
    variable("repository", "instance", 2),
    variable("cache", "instance", 3),
    variable("pending", "instance", 4),
    variable("ready", "instance", 5),
  ];
  const input = architectureDiff([
    ...fields,
    variable("value", "parameter", 10, "apply"),
    variable("value", "local", 11, "apply"),
    variable("result", "local", 12, "apply"),
    variable("value", "parameter", 20, "prepare"),
    variable("result", "local", 21, "prepare"),
  ]);
  input.classes[0].methods.push(
    { name: "apply", changeType: "modified" },
    { name: "prepare", changeType: "modified" }
  );
  input.classes.push({
    name: "DerivedService",
    changeType: "modified",
    methods: [{ name: "refresh", changeType: "added" }],
    variableExposure: fields,
  });
  const validation = await runScript(t, input, validatorPath);
  assert.equal(validation.status, 0, validation.stderr);
  assert.doesNotMatch(validation.stdout, /Variable Exposure:/);
  const result = await runScript(t, input, counterPath);
  assert.equal(result.status, 0, result.stderr);
  const expected = JSON.parse(JSON.stringify(input));
  expected.variableExposureCount = 9;
  expected.classes[0].variableExposureCount = 9;
  expected.classes[1].variableExposureCount = 4;
  assert.deepEqual(JSON.parse(await readFile(result.inputPath, "utf8")), expected);
  const savedValidation = spawnSync(process.execPath, [validatorPath, result.inputPath], { encoding: "utf8" });
  assert.equal(savedValidation.status, 0, savedValidation.stderr);
});

test("distinguishes unknown inventories from a verified zero", async (t) => {
  const empty = await runScript(t, architectureDiff([]), counterPath);
  assert.equal(empty.status, 0, empty.stderr);
  assert.equal(JSON.parse(await readFile(empty.inputPath, "utf8")).variableExposureCount, 0);
  assert.equal(JSON.parse(await readFile(empty.inputPath, "utf8")).classes[0].variableExposureCount, 0);

  const input = architectureDiff([variable("value", "instance", 2)]);
  input.classes.push({ name: "OtherService", changeType: "modified", methods: [], variableExposure: null, variableExposureCount: 7 });
  input.variableExposureCount = 8;
  const unknown = await runScript(t, input, counterPath);
  assert.equal(unknown.status, 0, unknown.stderr);
  assert.equal(JSON.parse(await readFile(unknown.inputPath, "utf8")).variableExposureCount, null);
  assert.deepEqual(
    JSON.parse(await readFile(unknown.inputPath, "utf8")).classes.map((classDiff) => classDiff.variableExposureCount),
    [1, null]
  );
});

test("refreshes the saved count after inventory changes and on repeat runs", async (t) => {
  const input = architectureDiff([variable("value", "instance", 2)]);
  input.variableExposureCount = 8;
  input.classes[0].variableExposureCount = 8;
  const firstRun = await runScript(t, input, counterPath);
  assert.equal(firstRun.status, 0, firstRun.stderr);
  const updatedInput = JSON.parse(await readFile(firstRun.inputPath, "utf8"));
  assert.equal(updatedInput.variableExposureCount, 1);
  assert.equal(updatedInput.classes[0].variableExposureCount, 1);
  updatedInput.classes[0].variableExposure.push(variable("otherValue", "instance", 3));
  await writeFile(firstRun.inputPath, JSON.stringify(updatedInput));
  const expected = JSON.parse(JSON.stringify(updatedInput));
  expected.variableExposureCount = 2;
  expected.classes[0].variableExposureCount = 2;
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const result = spawnSync(process.execPath, [counterPath, firstRun.inputPath], { encoding: "utf8" });
    assert.equal(result.status, 0, result.stderr);
    assert.deepEqual(JSON.parse(await readFile(firstRun.inputPath, "utf8")), expected);
  }
});

test("requires the version 2 inventory and valid variable declarations", async (t) => {
  const oldVersion = architectureDiff([]);
  oldVersion.schemaVersion = 1;
  const missingInventory = architectureDiff(undefined);
  const missingMethod = architectureDiff([variable("value", "local", 10)]);
  const instanceWithMethod = architectureDiff([variable("value", "instance", 2, "apply")]);
  const invalidLine = architectureDiff([variable("value", "instance", 0)]);
  const missingLocation = architectureDiff([{ name: "value", kind: "instance" }]);
  for (const input of [oldVersion, missingInventory, missingMethod, instanceWithMethod, invalidLine, missingLocation]) {
    for (const scriptPath of [validatorPath, counterPath]) {
      const result = await runScript(t, input, scriptPath);
      assert.notEqual(result.status, 0);
      assert.equal(await readFile(result.inputPath, "utf8"), JSON.stringify(input));
    }
  }
});

test("rejects duplicate declarations within a class", async (t) => {
  const field = variable("value", "instance", 2);
  const duplicate = await runScript(t, architectureDiff([field, field]), validatorPath);
  assert.notEqual(duplicate.status, 0);
  assert.match(duplicate.stderr, /Duplicate exposed variable/);
});

test("requires canonical repository-relative declaration paths for consistent counting", async (t) => {
  for (const file of ["/src/Service.js", "../Service.js", "src/../Service.js", "./src/Service.js", "src\\Service.js"]) {
    const input = architectureDiff([variable("value", "instance", 2)]);
    input.classes[0].variableExposure[0].declaredAt.file = file;
    const result = await runScript(t, input, validatorPath);
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /canonical and repository-relative/);
  }
});

test("rejects exposure assigned to unchanged context classes", async (t) => {
  const input = architectureDiff([variable("value", "instance", 2)]);
  input.classes[0].changeType = "unchanged";
  const result = await runScript(t, input, validatorPath);
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /Unchanged context class has variable exposure/);
});
