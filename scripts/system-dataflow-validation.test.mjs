import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm, utimes, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import Ajv2020 from "ajv/dist/2020.js";
import { findNewestSystemDataflow } from "../common/system-dataflow/visualizer/default-system-dataflow.mjs";
import { semanticError } from "../common/system-dataflow/visualizer/src/validation.ts";

const example = JSON.parse(await readFile(new URL("../common/system-dataflow/system-dataflow.example.json", import.meta.url), "utf8"));
const schema = JSON.parse(await readFile(new URL("../common/system-dataflow/system-dataflow.schema.json", import.meta.url), "utf8"));
const validate = new Ajv2020({ allErrors: true }).compile(schema);

const directions = {
  "user-input": { incoming: false, outgoing: true },
  "user-output": { incoming: true, outgoing: false },
  "external-dependency": { incoming: true, outgoing: true },
  "system-input": { incoming: false, outgoing: true },
  "system-output": { incoming: true, outgoing: false },
  "system-state": { incoming: true, outgoing: true },
  "static-data": { incoming: false, outgoing: true },
  "data-processing": { incoming: true, outgoing: true },
};

function node(type, name) {
  const value = { type, name, description: `${name} description`, medium: "Test medium", location: "Test location" };
  if (type === "data-processing") value.algorithm = "Transform the input.";
  return value;
}

function dataflow(type, direction) {
  const endpoint = node(type, "Endpoint");
  const processor = node("data-processing", "Processor");
  return {
    schemaVersion: 2,
    stage: "high-level-design",
    feature: "Direction validation",
    nodes: [endpoint, processor],
    relationships: [{
      id: "relationship-1",
      from: direction === "outgoing" ? endpoint.name : processor.name,
      to: direction === "outgoing" ? processor.name : endpoint.name,
      type: "dataflow",
      data: "Test data",
      purpose: "Verify the permitted direction.",
    }],
  };
}

test("the example satisfies schema and direction validation", () => {
  assert.equal(validate(example), true, JSON.stringify(validate.errors));
  assert.equal(semanticError(example), undefined);
});

test("every node type permits only its legal relationship directions", () => {
  for (const [type, allowed] of Object.entries(directions)) {
    for (const direction of ["incoming", "outgoing"]) {
      const value = dataflow(type, direction);
      assert.equal(validate(value), true, JSON.stringify(validate.errors));
      const error = semanticError(value);
      if (allowed[direction]) {
        assert.equal(error, undefined, `${type} should allow ${direction} dataflow`);
      } else {
        assert.match(error, new RegExp(`cannot ${direction === "incoming" ? "enter" : "leave"} ${type} node`));
      }
    }
  }
});

test("finds the newest System Dataflow under the configured output directory", async (t) => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "system-dataflow-visualizer-"));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const repositoryDirectory = path.join(directory, "repository");
  const toolkitDirectory = path.join(directory, "toolkit");
  const outputDirectory = path.join(repositoryDirectory, "docs", "plans", "feature");
  await mkdir(outputDirectory, { recursive: true });
  await mkdir(toolkitDirectory, { recursive: true });
  await writeFile(path.join(toolkitDirectory, "config.json"), '{"outputDirectory":"docs/plans"}\n');
  const older = path.join(outputDirectory, "older.system-dataflow.json");
  const newer = path.join(outputDirectory, "newer.system-dataflow.code-review.json");
  await writeFile(older, "{}");
  await writeFile(newer, "{}");
  await writeFile(path.join(outputDirectory, "ignored.json"), "{}");
  await utimes(older, new Date(1_000), new Date(1_000));
  await utimes(newer, new Date(2_000), new Date(2_000));
  assert.equal(await findNewestSystemDataflow(repositoryDirectory, toolkitDirectory), newer);
});
