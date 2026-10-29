import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";

import Ajv2020 from "ajv/dist/2020.js";

import { implementationDataflowErrors } from "./semantic-errors.mjs";

const validate = new Ajv2020({ allErrors: true }).compile(JSON.parse(await readFile(new URL("./impl-dataflow.schema.json", import.meta.url), "utf8")));

function validateGraph(graph) {
  if (!validate(graph)) {
    throw new Error(`Implementation dataflow does not match its schema:\n${validate.errors.map((error) => `${error.instancePath || "/"}: ${error.message}`).join("\n")}`);
  }
  const errors = implementationDataflowErrors(graph);
  if (errors.length > 0) throw new Error(`Implementation dataflow is invalid:\n${errors.join("\n")}`);
}

export function annotateHelperFunctions(graph) {
  const annotated = structuredClone(graph);
  for (const node of annotated.nodes) {
    if (node.type === "function") {
      delete node.helper;
      delete node.helperOf;
    }
  }
  validateGraph(annotated);
  const callers = new Map();
  const links = new Map();
  for (const relationship of annotated.relationships) {
    if (relationship.type === "dataflow" && relationship.from.type === "function" && relationship.to.type === "function") {
      let callerId;
      let calleeId;
      if (relationship.transferType === "arguments") {
        callerId = relationship.from.nodeId;
        calleeId = relationship.to.nodeId;
      } else if (relationship.transferType === "return") {
        callerId = relationship.to.nodeId;
        calleeId = relationship.from.nodeId;
      }
      const functionCallers = callers.get(calleeId) ?? new Set();
      functionCallers.add(callerId);
      callers.set(calleeId, functionCallers);
      for (const [id, otherId] of [[callerId, calleeId], [calleeId, callerId]]) {
        const functionLinks = links.get(id) ?? [];
        functionLinks.push(otherId);
        links.set(id, functionLinks);
      }
    }
  }
  const functions = new Map(annotated.nodes.filter((node) => node.type === "function").map((node) => [node.id, node]));
  for (const node of functions.values()) {
    const functionCallers = callers.get(node.id);
    if (node.subtype !== "missing-from-cr" && functionCallers?.size === 1) {
      const callerId = [...functionCallers][0];
      const caller = functions.get(callerId);
      if (callerId !== node.id && caller.subtype !== "missing-from-cr" && caller.containerId === node.containerId) node.helperOf = callerId;
    }
  }
  for (const node of functions.values()) {
    const functionLinks = links.get(node.id) ?? [];
    if (node.subtype !== "missing-from-cr" && node.helperOf === undefined && functionLinks.length === 1) {
      const parent = functions.get(functionLinks[0]);
      if (parent.id !== node.id && parent.subtype !== "missing-from-cr" && parent.containerId === node.containerId && parent.helperOf !== node.id) node.helperOf = parent.id;
    }
  }
  validateGraph(annotated);
  return annotated;
}

async function main() {
  if (process.argv.length !== 3) {
    console.error("Usage: node annotate-helper-functions.mjs <impl-dataflow.json>");
    process.exitCode = 1;
  } else {
    const inputPath = process.argv[2];
    const annotated = annotateHelperFunctions(JSON.parse(await readFile(inputPath, "utf8")));
    await writeFile(inputPath, `${JSON.stringify(annotated, null, 2)}\n`);
    console.log(`Annotated helper functions: ${inputPath}`);
  }
}

if (process.argv[1] !== undefined && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  try {
    await main();
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
