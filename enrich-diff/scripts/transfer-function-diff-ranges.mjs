import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";

import Ajv2020 from "ajv/dist/2020.js";

import { parsePatch, semanticErrors as enrichedPatchErrors } from "../../common/enriched-patch/generate-enriched-patch.mjs";
import { implementationDataflowErrors } from "../../common/impl-dataflow/semantic-errors.mjs";
import { changeOwnershipErrors } from "./validate-enriched-patch.mjs";

const ajv = new Ajv2020({ allErrors: true });
const validateDataflow = ajv.compile(JSON.parse(await readFile(new URL("../../common/impl-dataflow/impl-dataflow.schema.json", import.meta.url), "utf8")));
const validatePatch = ajv.compile(JSON.parse(await readFile(new URL("../../common/enriched-patch/enriched-patch.schema.json", import.meta.url), "utf8")));

function validate(value, validator, label) {
  if (!validator(value)) {
    throw new Error(`${label} does not match its schema:\n${validator.errors.map((error) => `${error.instancePath || "/"}: ${error.message}`).join("\n")}`);
  }
}

export function transferFunctionDiffRanges(review, enrichedPatch) {
  validate(review, validateDataflow, "Implementation dataflow");
  validate(enrichedPatch, validatePatch, "Enriched patch");
  const reviewErrors = implementationDataflowErrors(review);
  const patchErrors = [...enrichedPatchErrors(enrichedPatch, parsePatch(enrichedPatch.patch)), ...changeOwnershipErrors(enrichedPatch)];
  if (reviewErrors.length > 0) throw new Error(`Implementation dataflow is invalid:\n${reviewErrors.join("\n")}`);
  if (patchErrors.length > 0) throw new Error(`Enriched patch is invalid:\n${patchErrors.join("\n")}`);

  const result = structuredClone(review);
  const containers = new Map(result.containers.map((container) => [container.id, container]));
  const hunks = new Map(result.diffHunks.map((hunk) => [hunk.id, hunk]));
  for (const node of result.nodes) {
    if (node.type !== "function") continue;
    if (node.subtype === "missing-from-cr" || node.changeType === "unchanged") {
      delete node.enrichedPatchElementId;
      delete node.locations;
      delete node.changes;
      continue;
    }

    const owner = containers.get(node.containerId);
    const matches = Object.entries(enrichedPatch.elements).filter(([, element]) => {
      if (element.kind !== "method" || element.name !== node.name ||
        !element.locations.some((location) => location.file === node.sourceFile)) return false;
      const parent = enrichedPatch.elements[element.parentId];
      if (owner.type === "class") {
        return parent.kind === "class" && parent.name === owner.name;
      } else if (owner.type === "module") {
        return parent.kind === "file";
      }
    });
    if (matches.length !== 1) throw new Error(`Expected one enriched-patch method for ${node.sourceFile} ${owner.name}.${node.name}, found ${matches.length}.`);

    const [id, method] = matches[0];
    node.enrichedPatchElementId = id;
    let methods = [method];
    if (node.renamedFrom !== undefined) {
      const pairs = (enrichedPatch.renames ?? []).filter((pair) => pair.to === id);
      if (pairs.length !== 1) throw new Error(`Expected one enriched-patch rename for ${node.id}, found ${pairs.length}.`);
      const oldMethod = enrichedPatch.elements[pairs[0].from];
      const oldParent = enrichedPatch.elements[oldMethod.parentId];
      const oldOwner = node.renamedFrom.containerName ?? owner.renamedFrom?.name ?? owner.name;
      if (oldMethod.kind !== "method" || oldMethod.name !== node.renamedFrom.name ||
        !oldMethod.locations.some((location) => location.file === node.renamedFrom.sourceFile) ||
        (owner.type === "class" && (oldParent.kind !== "class" || oldParent.name !== oldOwner)) ||
        (owner.type === "module" && oldParent.kind !== "file")) {
        throw new Error(`Enriched-patch rename does not match ${node.id}.`);
      }
      methods = [oldMethod, method];
    }
    node.locations = structuredClone(methods.flatMap((item) => item.locations));
    node.changes = structuredClone(methods.flatMap((item) => item.changes ?? []));
    const hunkFiles = new Set(node.diffHunkIds.map((hunkId) => hunks.get(hunkId).file));
    if (node.changes.length === 0 || node.locations.some((location) => !hunkFiles.has(location.file))) {
      throw new Error(`Function diff ranges are not covered by cited hunks for ${node.id}.`);
    }
  }

  validate(result, validateDataflow, "Implementation dataflow");
  return result;
}

async function main() {
  const args = process.argv.slice(2);
  if (args.length !== 2) {
    console.error("Usage: node transfer-function-diff-ranges.mjs <cr.impl-dataflow.json> <enriched-patch.json>");
    process.exitCode = 1;
  } else {
    const [review, enrichedPatch] = await Promise.all(args.map((file) => readFile(file, "utf8")));
    const result = transferFunctionDiffRanges(JSON.parse(review), JSON.parse(enrichedPatch));
    await writeFile(args[0], `${JSON.stringify(result, null, 2)}\n`);
    console.log(`Transferred function diff ranges: ${path.resolve(args[0])}`);
  }
}

if (process.argv[1] !== undefined && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  await main();
}
