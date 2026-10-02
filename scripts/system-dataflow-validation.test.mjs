import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm, utimes, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
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
  "system-state": { incoming: true, outgoing: true },
  "static-data": { incoming: false, outgoing: true },
  "data-processing": { incoming: true, outgoing: true },
};

function node(type, name) {
  const value = { type, name, description: `${name} description`, medium: "Test medium", location: "Test location" };
  if (type === "data-processing") value["pseudo-code"] = "result = transform(input)";
  return value;
}

function dataflow(type, direction) {
  const endpoint = node(type, "Endpoint");
  const processor = node("data-processing", "Processor");
  return {
    schemaVersion: 3,
    stage: "high-level-design",
    feature: "Direction validation",
    subgraphs: [{
      id: "journey-1",
      name: "Test flow",
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

test("requires explicit named subgraphs and rejects the flat format", () => {
  const value = structuredClone(example);
  value.schemaVersion = 2;
  value.nodes = value.subgraphs[0].nodes;
  value.relationships = value.subgraphs[0].relationships;
  delete value.subgraphs;
  assert.equal(validate(value), false);

  for (const field of ["id", "name", "nodes", "relationships"]) {
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
    value.subgraphs.push({ id: "another-flow", name: "Another flow", nodes: [node("system-state", "Other state")], relationships: [] });
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

test("lays out explicit subgraphs separately in document order", () => {
  const subgraphs = [
    { id: "first", name: "First flow", nodes: [node("user-input", "Start"), node("user-output", "Finish")], relationships: [{ id: "transfer", from: "Start", to: "Finish" }] },
    { id: "second", name: "Second flow", nodes: [node("system-state", "Independent state")], relationships: [] },
    { id: "third", name: "Third flow", nodes: [node("user-input", "Other input")], relationships: [] },
  ];
  const layout = computeLayout(subgraphs);
  let previousRight = 0;
  for (const subgraph of subgraphs) {
    const bounds = layout.subgraphs.get(subgraph.id);
    assert.ok(bounds.x >= previousRight);
    for (const node of subgraph.nodes) {
      const box = layout.boxes.get(node.name);
      assert.ok(box.x >= bounds.x && box.x + box.width <= bounds.x + bounds.width);
      assert.ok(box.y > bounds.y && box.y + box.height <= bounds.y + bounds.height);
    }
    previousRight = bounds.x + bounds.width;
  }
  assert.equal(layout.width, previousRight);
  assert.ok(layout.boxes.get("Finish").y > layout.boxes.get("Start").y);
  assert.equal(layout.boxes.get("Independent state").y, layout.boxes.get("Other input").y);
});

test("keeps subgraph bounds when filters leave it empty", () => {
  const layout = computeLayout([{ id: "filtered-flow", name: "Filtered flow", nodes: [], relationships: [] }]);
  assert.equal(layout.boxes.size, 0);
  assert.ok(layout.subgraphs.get("filtered-flow").width > 0);
  assert.ok(layout.width > 0 && layout.height > 0);
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
});
