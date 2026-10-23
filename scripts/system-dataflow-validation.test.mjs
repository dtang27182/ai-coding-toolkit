import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdir, mkdtemp, readFile, rm, utimes, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import Ajv2020 from "ajv/dist/2020.js";
import { findNewestSystemDataflow } from "../common/sys-dataflow/visualizer/default-system-dataflow.mjs";
import { semanticError } from "../common/sys-dataflow/visualizer/src/validation.ts";
import { computeLayout } from "../common/sys-dataflow/visualizer/src/layout.ts";

const example = JSON.parse(await readFile(new URL("../common/sys-dataflow/sys-dataflow.example.json", import.meta.url), "utf8"));
const schema = JSON.parse(await readFile(new URL("../common/sys-dataflow/sys-dataflow.schema.json", import.meta.url), "utf8"));
const validate = new Ajv2020({ allErrors: true }).compile(schema);

const directions = {
  "user-input": { incoming: false, outgoing: true },
  "user-output": { incoming: true, outgoing: false },
  "external-dependency": { incoming: true, outgoing: true },
  "system-input": { incoming: false, outgoing: true },
  "system-output": { incoming: true, outgoing: false },
  "system-state-read": { incoming: false, outgoing: true },
  "system-state-write": { incoming: true, outgoing: false },
  "static-data": { incoming: false, outgoing: true },
  "data-processing": { incoming: true, outgoing: true },
};

function node(type, name) {
  const value = { type, name, journeySequenceId: 1, description: `${name} description`, medium: "Test medium", location: "Test location" };
  if (type === "data-processing") value["pseudo-code"] = "result = transform(input)";
  return value;
}

function dataflow(type, direction) {
  const endpoint = node(type, "Endpoint");
  const processor = node("data-processing", "Processor");
  return {
    schemaVersion: 4,
    stage: "high-level-design",
    feature: "Direction validation",
    subgraphs: [{
      id: "journey-1",
      name: "Test flow",
      journeySequenceId: 1,
      nodes: [endpoint, processor],
      relationships: [{
        id: "relationship-1",
        from: direction === "outgoing" ? endpoint.name : processor.name,
        to: direction === "outgoing" ? processor.name : endpoint.name,
        type: "dataflow",
        data: "Test data",
        purpose: "Verify the permitted direction.",
      }],
    }],
  };
}

test("the example satisfies schema and direction validation", () => {
  assert.equal(validate(example), true, JSON.stringify(validate.errors));
  assert.equal(semanticError(example), undefined);
});

test("requires phase IDs on subgraphs and nodes and matching values", async (t) => {
  for (const target of ["subgraph", "node"]) {
    const value = structuredClone(example);
    if (target === "subgraph") {
      delete value.subgraphs[0].journeySequenceId;
    } else {
      delete value.subgraphs[0].nodes[0].journeySequenceId;
    }
    assert.equal(validate(value), false);
    for (const invalidId of [0, 1.5]) {
      if (target === "subgraph") {
        value.subgraphs[0].journeySequenceId = invalidId;
      } else {
        value.subgraphs[0].nodes[0].journeySequenceId = invalidId;
      }
      assert.equal(validate(value), false);
    }
  }

  const value = structuredClone(example);
  value.subgraphs[0].nodes[0].journeySequenceId = 2;
  assert.equal(validate(value), true, JSON.stringify(validate.errors));
  assert.match(semanticError(value), /must use journeySequenceId 1/);
  const directory = await mkdtemp(path.join(os.tmpdir(), "system-dataflow-phase-"));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const inputPath = path.join(directory, "dataflow.json");
  await writeFile(inputPath, JSON.stringify(value));
  const result = spawnSync(process.execPath, [fileURLToPath(new URL("../common/sys-dataflow/validate-sys-dataflow.mjs", import.meta.url)), inputPath], { encoding: "utf8" });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /must use journeySequenceId 1/);
});

test("inspect-code dataflows validate without comparison fields", () => {
  const value = dataflow("user-input", "outgoing");
  value.stage = "inspect-code";
  assert.equal(validate(value), true, JSON.stringify(validate.errors));
  assert.equal(semanticError(value), undefined);
  value.subgraphs[0].nodes[0].diffHunkIds = ["hunk-1"];
  assert.equal(validate(value), false);
});

test("requires explicit named subgraphs and rejects the flat format", () => {
  const value = structuredClone(example);
  value.schemaVersion = 2;
  value.nodes = value.subgraphs[0].nodes;
  value.relationships = value.subgraphs[0].relationships;
  delete value.subgraphs;
  assert.equal(validate(value), false);

  for (const field of ["id", "name", "journeySequenceId", "nodes", "relationships"]) {
    const value = structuredClone(example);
    delete value.subgraphs[0][field];
    assert.equal(validate(value), false, `Subgraphs must contain ${field}`);
  }
});

test("rejects duplicate subgraph IDs and document-wide node names and relationship IDs", () => {
  for (const duplicate of ["subgraph", "node", "relationship"]) {
    const value = dataflow("user-input", "outgoing");
    value.subgraphs.push({
      id: duplicate === "subgraph" ? value.subgraphs[0].id : "another-flow",
      name: "Another flow",
      journeySequenceId: 1,
      nodes: [node("user-input", duplicate === "node" ? "Endpoint" : "Another input"), node("user-output", "Another output")],
      relationships: [{
        ...value.subgraphs[0].relationships[0],
        id: duplicate === "relationship" ? value.subgraphs[0].relationships[0].id : "another-relationship",
        from: duplicate === "node" ? "Endpoint" : "Another input",
        to: "Another output",
      }],
    });
    assert.equal(validate(value), true, JSON.stringify(validate.errors));
    assert.match(semanticError(value), /must be unique/);
  }
});

test("relationship endpoints must belong to their containing subgraph", () => {
  for (const endpoint of ["from", "to"]) {
    const value = dataflow("user-input", "outgoing");
    value.subgraphs.push({ id: "another-flow", name: "Another flow", journeySequenceId: 1, nodes: [node("system-state-read", "Other state")], relationships: [] });
    assert.equal(semanticError(value), undefined);
    value.subgraphs[0].relationships[0][endpoint] = "Other state";
    assert.equal(validate(value), true, JSON.stringify(validate.errors));
    assert.match(semanticError(value), /references unknown (source|destination) node “Other state”/);
  }
});

test("high-level-design nodes and relationships cannot reference diff hunks inside subgraphs", () => {
  for (const collection of ["nodes", "relationships"]) {
    const value = structuredClone(example);
    value.subgraphs[0][collection][0].diffHunkIds = ["hunk-1"];
    assert.equal(validate(value), false);
  }
});

test("lays out subgraphs horizontally within a phase and vertically across phases", () => {
  const subgraphs = [
    { id: "first", name: "First flow", journeySequenceId: 1, nodes: [node("user-input", "Start"), node("user-output", "Finish")], relationships: [{ id: "transfer", from: "Start", to: "Finish" }] },
    { id: "second", name: "Second flow", journeySequenceId: 1, nodes: [node("system-state-read", "Independent state")], relationships: [] },
    { id: "third", name: "Third flow", journeySequenceId: 2, nodes: [{ ...node("user-input", "Other input"), journeySequenceId: 2 }], relationships: [] },
  ];
  const layout = computeLayout(subgraphs);
  for (const subgraph of subgraphs) {
    const bounds = layout.subgraphs.get(subgraph.id);
    for (const node of subgraph.nodes) {
      const box = layout.boxes.get(node.name);
      assert.ok(box.x >= bounds.x && box.x + box.width <= bounds.x + bounds.width);
      assert.ok(box.y > bounds.y && box.y + box.height <= bounds.y + bounds.height);
    }
  }
  assert.equal(layout.subgraphs.get("first").y, layout.subgraphs.get("second").y);
  assert.ok(layout.subgraphs.get("second").x >= layout.subgraphs.get("first").x + layout.subgraphs.get("first").width);
  assert.equal(layout.subgraphs.get("third").x, 0);
  assert.ok(layout.subgraphs.get("third").y >= layout.subgraphs.get("first").y + layout.subgraphs.get("first").height);
  assert.ok(layout.subgraphs.get("third").y >= layout.subgraphs.get("second").y + layout.subgraphs.get("second").height);
  assert.ok(layout.boxes.get("Finish").y > layout.boxes.get("Start").y);
});

test("keeps subgraph bounds when filters leave it empty", () => {
  const layout = computeLayout([{ id: "filtered-flow", name: "Filtered flow", journeySequenceId: 2, nodes: [], relationships: [] }]);
  assert.equal(layout.boxes.size, 0);
  assert.ok(layout.subgraphs.get("filtered-flow").width > 0);
  assert.ok(layout.width > 0 && layout.height > 0);
});

test("orders phase rows by sequence ID even when subgraphs appear out of order", () => {
  const layout = computeLayout([
    { id: "later", name: "Later", journeySequenceId: 3, nodes: [{ ...node("user-input", "Later input"), journeySequenceId: 3 }], relationships: [] },
    { id: "earlier", name: "Earlier", journeySequenceId: 1, nodes: [node("user-input", "Earlier input")], relationships: [] },
  ]);
  assert.ok(layout.subgraphs.get("earlier").y < layout.subgraphs.get("later").y);
});

test("processing nodes require pseudo-code and reject the old algorithm field", () => {
  const value = structuredClone(example);
  const processing = value.subgraphs[0].nodes.find((node) => node.type === "data-processing");
  delete processing["pseudo-code"];
  assert.equal(validate(value), false);

  processing.algorithm = "Legacy algorithm";
  assert.equal(validate(value), false);

  processing["pseudo-code"] = "result = transform(input)";
  assert.equal(validate(value), false);

  delete processing.algorithm;
  value.subgraphs[0].nodes[0]["pseudo-code"] = "result = transform(input)";
  assert.equal(validate(value), false);
});

test("every node type permits only its legal relationship directions", async (t) => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "system-dataflow-directions-"));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const inputPath = path.join(directory, "dataflow.json");
  for (const [type, allowed] of Object.entries(directions)) {
    for (const direction of ["incoming", "outgoing"]) {
      const value = dataflow(type, direction);
      assert.equal(validate(value), true, JSON.stringify(validate.errors));
      const error = semanticError(value);
      await writeFile(inputPath, JSON.stringify(value));
      const result = spawnSync(process.execPath, [
        fileURLToPath(new URL("../common/sys-dataflow/validate-sys-dataflow.mjs", import.meta.url)),
        inputPath,
      ], { encoding: "utf8" });
      if (allowed[direction]) {
        assert.equal(error, undefined, `${type} should allow ${direction} dataflow`);
        assert.equal(result.status, 0, result.stderr);
      } else {
        assert.match(error, new RegExp(`cannot ${direction === "incoming" ? "enter" : "leave"} ${type} node`));
        assert.equal(result.status, 1);
        assert.match(result.stderr, new RegExp(`cannot ${direction === "incoming" ? "enter" : "leave"} ${type} node`));
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
  const older = path.join(outputDirectory, "legacy.system-dataflow.json");
  const proposed = path.join(outputDirectory, "feature.sys-dataflow.json");
  const newer = path.join(outputDirectory, "feature.cr.sys-dataflow.json");
  await writeFile(older, "{}");
  await writeFile(proposed, "{}");
  await writeFile(newer, "{}");
  await writeFile(path.join(outputDirectory, "ignored.json"), "{}");
  await utimes(older, new Date(1_000), new Date(1_000));
  await utimes(proposed, new Date(2_000), new Date(2_000));
  await utimes(newer, new Date(3_000), new Date(3_000));
  assert.equal(await findNewestSystemDataflow(repositoryDirectory, toolkitDirectory), newer);
  const journeyDirectory = path.join(repositoryDirectory, "docs", "plans", "user-journey-dataflow");
  await mkdir(journeyDirectory);
  const journey = path.join(journeyDirectory, "journey.sys-dataflow.json");
  await writeFile(journey, "{}");
  await utimes(journey, new Date(1_500), new Date(1_500));
  assert.equal(await findNewestSystemDataflow(repositoryDirectory, toolkitDirectory, "user-journey-dataflow"), journey);
});
