import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import Ajv2020 from "ajv/dist/2020.js";
import { semanticError } from "../hld-gen/visualizer/src/validation.ts";

const validatorPath = fileURLToPath(new URL("../hld-gen/scripts/validate-architecture-diff.mjs", import.meta.url));
const example = JSON.parse(await readFile(new URL("../hld-gen/references/architecture-diff.example.json", import.meta.url), "utf8"));
const schema = JSON.parse(await readFile(new URL("../hld-gen/references/architecture-diff.schema.json", import.meta.url), "utf8"));
const validate = new Ajv2020({ allErrors: true }).compile(schema);

async function checkValidators(t, input, expectedError) {
  assert.equal(validate(input), true, JSON.stringify(validate.errors));
  const directory = await mkdtemp(path.join(os.tmpdir(), "user-flow-validation-"));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const inputPath = path.join(directory, "design.json");
  const contents = JSON.stringify(input);
  await writeFile(inputPath, contents);
  const result = spawnSync(process.execPath, [validatorPath, inputPath], { encoding: "utf8" });
  if (expectedError === undefined) {
    assert.equal(semanticError(input), undefined);
    assert.equal(result.status, 0, result.stderr);
  } else {
    assert.equal(semanticError(input), expectedError);
    assert.notEqual(result.status, 0);
    assert.ok(result.stderr.includes(expectedError), result.stderr);
  }
  assert.equal(JSON.stringify(input), contents);
  assert.equal(await readFile(inputPath, "utf8"), contents);
}

test("both validators accept classes whose participation comes only from methods", async (t) => {
  const input = structuredClone(example);
  input.classes[0].hasUserFlowState = false;
  input.relationships = [];
  await checkValidators(t, input);
});

test("both validators accept composition-only classes and read-only user-flow state", async (t) => {
  const input = structuredClone(example);
  input.classes[0].methods = [];
  input.classes[0].hasUserFlowState = false;
  input.classes[1].hasUserFlowState = true;
  input.relationships = [{ from: { class: "ChangeService" }, to: { class: "ChangeModel" }, type: "composition", changeType: "added" }];
  await checkValidators(t, input);
});

test("both validators reject supporting endpoints on either side of user-flow relationships", async (t) => {
  const supporting = structuredClone(example);
  supporting.classes.push({
    name: "Setup", changeType: "added", hasUserFlowState: false,
    methods: [{ name: "register", changeType: "added", userFlow: false }], variableExposure: [],
  });
  supporting.components[1].userFlow = false;
  for (const [endpoint, other, type, error] of [
    [{ class: "ChangeService", method: "configure" }, { class: "Repository", method: "readSourceFiles" }, "dataflow", "method: ChangeService.configure"],
    [{ component: "Source Files on Disk" }, { component: "Change Panel" }, "dataflow", "component: Source Files on Disk"],
    [{ class: "Setup", method: "register" }, { class: "Repository", method: "readSourceFiles" }, "dataflow", "method: Setup.register"],
  ]) {
    for (const [from, to] of [[endpoint, other], [other, endpoint]]) {
      const input = structuredClone(supporting);
      input.relationships = [{ from, to, type, label: "flow", changeType: "added", userFlow: true }];
      await checkValidators(t, input, `User-flow relationship references a supporting ${error}`);
      input.relationships[0].userFlow = false;
      await checkValidators(t, input);
    }
  }
});

test("both validators reject supporting state-update writers and state owners", async (t) => {
  for (const writerIsSupporting of [true, false]) {
    const input = structuredClone(example);
    input.classes[1].hasUserFlowState = writerIsSupporting;
    input.relationships = [{
      from: { class: "ChangeService", method: writerIsSupporting ? "configure" : "buildChangeSet" },
      to: { class: "ChangeModel" }, type: "state-update", label: "changes: store result", changeType: "added", userFlow: true,
    }];
    await checkValidators(t, input, writerIsSupporting
      ? "User-flow relationship references a supporting method: ChangeService.configure"
      : "User-flow state update targets a class without user-flow state: ChangeModel");
  }
});

test("both validators accept mixed classes, unchanged user-flow entries, and supporting relationships between user-flow endpoints", async (t) => {
  const input = structuredClone(example);
  await checkValidators(t, input);
  input.relationships.find((relationship) => relationship.type === "dataflow").userFlow = false;
  await checkValidators(t, input);
});
