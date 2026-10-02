import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import Ajv2020 from "ajv/dist/2020.js";

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const schemaPath = path.join(scriptDirectory, "sys-dataflow.schema.json");
const inputPath = process.argv[2];

const nodeDirections = {
  "user-input": { incoming: false, outgoing: true },
  "user-output": { incoming: true, outgoing: false },
  "external-dependency": { incoming: true, outgoing: true },
  "system-input": { incoming: false, outgoing: true },
  "system-output": { incoming: true, outgoing: false },
  "system-state": { incoming: true, outgoing: true },
  "static-data": { incoming: false, outgoing: true },
  "data-processing": { incoming: true, outgoing: true },
};

if (inputPath === undefined) {
  console.error("Usage: node validate-sys-dataflow.mjs <path-to-json>");
  process.exitCode = 1;
} else {
  const schema = JSON.parse(await readFile(schemaPath, "utf8"));
  const dataflow = JSON.parse(await readFile(path.resolve(inputPath), "utf8"));
  const validate = new Ajv2020({ allErrors: true }).compile(schema);
  if (!validate(dataflow)) {
    for (const error of validate.errors ?? []) {
      console.error(`${error.instancePath || "/"}: ${error.message}`);
    }
    process.exitCode = 1;
  } else {
    const errors = [];
    const nodes = dataflow.subgraphs.flatMap((subgraph) => subgraph.nodes);
    const relationships = dataflow.subgraphs.flatMap((subgraph) => subgraph.relationships);
    const subgraphIds = new Set();
    const names = new Set();
    const relationshipIds = new Set();
    const diffHunkIds = new Set();
    const referencedDiffHunkIds = new Set();
    for (const subgraph of dataflow.subgraphs) {
      if (subgraphIds.has(subgraph.id)) {
        errors.push(`Subgraph IDs must be unique: ${subgraph.id}`);
      } else {
        subgraphIds.add(subgraph.id);
      }
    }
    for (const node of nodes) {
      if (names.has(node.name)) {
        errors.push(`Node names must be unique: ${node.name}`);
      } else {
        names.add(node.name);
      }
    }
    for (const relationship of relationships) {
      if (relationshipIds.has(relationship.id)) {
        errors.push(`Relationship IDs must be unique: ${relationship.id}`);
      } else {
        relationshipIds.add(relationship.id);
      }
    }
    if (dataflow.stage === "code-review") {
      for (const diffHunk of dataflow.diffHunks) {
        if (diffHunkIds.has(diffHunk.id)) {
          errors.push(`Diff hunk IDs must be unique: ${diffHunk.id}`);
        } else {
          diffHunkIds.add(diffHunk.id);
        }
      }
      for (const entity of [...nodes, ...relationships]) {
        for (const diffHunkId of entity.diffHunkIds ?? []) {
          if (diffHunkIds.has(diffHunkId)) {
            referencedDiffHunkIds.add(diffHunkId);
          } else {
            errors.push(`Unknown diff hunk reference: ${diffHunkId}`);
          }
        }
      }
      for (const diffHunkId of diffHunkIds) {
        if (!referencedDiffHunkIds.has(diffHunkId)) {
          errors.push(`Diff hunk must be referenced: ${diffHunkId}`);
        }
      }
    }
    for (const subgraph of dataflow.subgraphs) {
      const nodesByName = new Map(subgraph.nodes.map((node) => [node.name, node]));
      for (const relationship of subgraph.relationships) {
        const source = nodesByName.get(relationship.from);
        const destination = nodesByName.get(relationship.to);
        if (source === undefined) {
          errors.push(`Relationship “${relationship.id}” references unknown source node “${relationship.from}”.`);
        } else if (destination === undefined) {
          errors.push(`Relationship “${relationship.id}” references unknown destination node “${relationship.to}”.`);
        } else if (!nodeDirections[source.type].outgoing) {
          errors.push(`Relationship “${relationship.id}” cannot leave ${source.type} node “${source.name}”.`);
        } else if (!nodeDirections[destination.type].incoming) {
          errors.push(`Relationship “${relationship.id}” cannot enter ${destination.type} node “${destination.name}”.`);
        }
      }
    }
    if (errors.length > 0) {
      for (const error of errors) console.error(error);
      process.exitCode = 1;
    } else {
      console.log(`Valid System Dataflow: ${inputPath}`);
    }
  }
}
