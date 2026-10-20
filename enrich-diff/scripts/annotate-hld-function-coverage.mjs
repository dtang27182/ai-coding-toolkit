import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";

import Ajv2020 from "ajv/dist/2020.js";

import { parsePatchDeclarations } from "../../common/enriched-patch/generate-enriched-patch.mjs";
import { implementationDataflowErrors } from "../../common/impl-dataflow/semantic-errors.mjs";

const mismatchKey = "hld-change-mismatch";
const generator = "annotate-hld-function-coverage";
const ajv = new Ajv2020({ allErrors: true });
const validateDataflow = ajv.compile(JSON.parse(await readFile(new URL("../../common/impl-dataflow/impl-dataflow.schema.json", import.meta.url), "utf8")));
const validateEnrichedPatch = ajv.compile(JSON.parse(await readFile(new URL("../../common/enriched-patch/enriched-patch.schema.json", import.meta.url), "utf8")));

function functionEntries(graph) {
  const containers = new Map(graph.containers.map((container) => [container.id, container]));
  return graph.nodes.filter((node) => node.type === "function").map((node) => {
    if (!containers.has(node.containerId)) {
      throw new Error(`Unknown container for function ${node.id}: ${node.containerId}`);
    }
    return {
      node,
      container: containers.get(node.containerId),
      key: JSON.stringify([node.sourceFile, containers.get(node.containerId).name, node.name]),
    };
  });
}

function patchFunctionIdentities(method, elements, files, reviewFunctions) {
  const parent = elements[method.parentId];
  const file = files.find((file) => (file.newPath ?? file.oldPath) === method.locations[0].file);
  const sourceFiles = new Set();
  if (method.locations[0].oldLines !== null) sourceFiles.add(file.oldPath);
  if (method.locations[0].newLines !== null) sourceFiles.add(file.newPath);
  const identities = [];
  for (const sourceFile of sourceFiles) {
    if (parent.kind === "class") {
      identities.push([sourceFile, parent.name, method.name]);
    } else if (parent.kind === "file") {
      // Standalone functions have no module name in the patch; use their explicit CR ownership.
      const owners = reviewFunctions.filter((entry) =>
        entry.node.sourceFile === sourceFile && entry.node.name === method.name && entry.container.type === "module",
      );
      if (owners.filter((entry) => entry.node.subtype !== "missing-from-cr").length > 1) {
        throw new Error(`Ambiguous enriched-patch function: ${sourceFile} ${method.name}`);
      }
      for (const entry of owners) identities.push([sourceFile, entry.container.name, method.name]);
    }
  }
  return identities;
}

function hasRenamePair(entry, planned, enrichedPatch) {
  if (planned?.node.renamedFrom === undefined || entry.container.type !== planned.container.type) {
    return false;
  } else {
    const oldOwner = planned.node.renamedFrom.containerName ?? planned.container.renamedFrom?.name ?? planned.container.name;
    return (enrichedPatch.renames ?? []).some(({ from, to }) => {
      const source = enrichedPatch.elements[from];
      const target = enrichedPatch.elements[to];
      if (source?.kind !== "method" || target?.kind !== "method"
        || source.name !== planned.node.renamedFrom.name
        || source.locations[0].file !== planned.node.renamedFrom.sourceFile
        || target.name !== entry.node.name || target.locations[0].file !== entry.node.sourceFile) {
        return false;
      } else {
        const sourceParent = enrichedPatch.elements[source.parentId];
        const targetParent = enrichedPatch.elements[target.parentId];
        if (entry.container.type === "class") {
          return sourceParent?.kind === "class" && sourceParent.name === oldOwner
            && targetParent?.kind === "class" && targetParent.name === entry.container.name;
        } else if (entry.container.type === "module") {
          return sourceParent?.kind === "file" && targetParent?.kind === "file";
        }
      }
    });
  }
}

function actualChangeType(node, container, files, renamed) {
  const matchingFiles = files.filter((file) => file.oldPath === node.sourceFile || file.newPath === node.sourceFile);
  let changeType;
  if (renamed) {
    changeType = "modified";
  } else if (matchingFiles.length === 0) {
    changeType = "unchanged";
  } else if (matchingFiles.length > 1) {
    throw new Error(`Ambiguous patch file for function ${node.id}: ${node.sourceFile}`);
  } else if (matchingFiles.length === 1) {
    const file = matchingFiles[0];
    if (file.oldDeclarations === undefined || file.newDeclarations === undefined) {
      throw new Error(`Unsupported source file for function ${node.id}: ${node.sourceFile}`);
    }
    let declarationKey;
    if (container.type === "class") {
      declarationKey = `class:${container.name}:method:${node.name}`;
    } else if (container.type === "module") {
      declarationKey = `method:${node.name}`;
    }
    const oldDeclarations = file.oldPath === node.sourceFile ? file.oldDeclarations.filter((declaration) => declaration.key === declarationKey) : [];
    const newDeclarations = file.newPath === node.sourceFile ? file.newDeclarations.filter((declaration) => declaration.key === declarationKey) : [];
    const ambiguousClass = container.type === "class" && [file.oldDeclarations, file.newDeclarations].some((declarations) =>
      declarations.filter((declaration) => declaration.kind === "class" && declaration.name === container.name).length > 1,
    );
    if (oldDeclarations.length > 1 || newDeclarations.length > 1 || ambiguousClass) {
      throw new Error(`Ambiguous function declaration: ${node.sourceFile} ${container.name}.${node.name}`);
    } else if (oldDeclarations.length === 0 && newDeclarations.length === 0) {
      throw new Error(`Function absent from patch source: ${node.sourceFile} ${container.name}.${node.name}`);
    } else if (oldDeclarations.length === 0) {
      changeType = "added";
    } else if (newDeclarations.length === 0) {
      changeType = "deleted";
    } else if (oldDeclarations.length === 1 && newDeclarations.length === 1) {
      const changed = file.rows.some((row) =>
        (row.kind === "delete" && oldDeclarations[0].range[0] <= row.oldLine && row.oldLine <= oldDeclarations[0].range[1]) ||
        (row.kind === "add" && newDeclarations[0].range[0] <= row.newLine && row.newLine <= newDeclarations[0].range[1]),
      );
      changeType = changed ? "modified" : "unchanged";
    }
  }
  return changeType;
}

function validateResult(value, validator, label) {
  if (!validator(value)) {
    throw new Error(`${label} does not match its schema:\n${validator.errors.map((error) => `${error.instancePath || "/"}: ${error.message}`).join("\n")}`);
  }
}

export function annotateHldFunctionCoverage(hld, review, patch, enrichedPatch) {
  if (hld.stage !== "high-level-design" || review.stage !== "code-review") {
    throw new Error("Expected a high-level-design HLD and a code-review implementation dataflow.");
  }
  validateResult(hld, validateDataflow, "HLD implementation dataflow");
  const hldErrors = implementationDataflowErrors(hld);
  if (hldErrors.length > 0) throw new Error(`HLD implementation dataflow is invalid:\n${hldErrors.join("\n")}`);
  const codeReview = structuredClone(review);
  const annotatedPatch = structuredClone(enrichedPatch);
  const files = parsePatchDeclarations(patch);
  const hldFunctions = new Map(functionEntries(hld).map((entry) => [entry.key, entry]));
  const entries = functionEntries(codeReview);
  const actualFunctions = new Map();
  const missingFunctions = new Map();
  const usedIds = new Set([...codeReview.nodes, ...codeReview.containers].map((entry) => entry.id));
  let nextId = 1;
  function newId() {
    let id;
    do {
      id = `entity-${nextId++}`;
    } while (usedIds.has(id));
    usedIds.add(id);
    return id;
  }

  for (const entry of entries) {
    if (entry.node.subtype === "missing-from-cr") {
      missingFunctions.set(entry.key, entry.node);
    } else if (entry.node.subtype === undefined) {
      if (actualFunctions.has(entry.key)) throw new Error(`Duplicate review function identity: ${entry.key}`);
      const planned = hldFunctions.get(entry.key);
      const renamed = hasRenamePair(entry, planned, annotatedPatch);
      entry.node.changeType = actualChangeType(entry.node, entry.container, files, renamed);
      if (renamed) {
        entry.node.renamedFrom = planned.node.renamedFrom;
      } else {
        delete entry.node.renamedFrom;
      }
      entry.node[mismatchKey] = planned === undefined ? entry.node.changeType !== "unchanged" : planned.node.changeType !== entry.node.changeType;
      entry.node.hldChangeType = planned === undefined ? null : planned.node.changeType;
      actualFunctions.set(entry.key, entry);
    }
  }
  codeReview.nodes = codeReview.nodes.filter((node) => node.type !== "function" || node.subtype !== "missing-from-cr");

  for (const [key, entry] of hldFunctions) {
    if (!actualFunctions.has(key) && ["added", "modified", "deleted"].includes(entry.node.changeType)) {
      let container = codeReview.containers.find((container) => container.name === entry.container.name);
      if (container === undefined) {
        container = {
          id: newId(), name: entry.container.name, type: entry.container.type, sourceFile: entry.container.sourceFile,
          ...(entry.container.renamedFrom === undefined ? {} : { renamedFrom: entry.container.renamedFrom }),
          generatedBy: generator,
        };
        codeReview.containers.push(container);
      } else if (container.type !== entry.container.type) {
        throw new Error(`Container type differs between HLD and review: ${container.name}`);
      }
      const previous = missingFunctions.get(key);
      const node = {
        id: previous === undefined ? newId() : previous.id,
        name: entry.node.name,
        type: "function",
        subtype: "missing-from-cr",
        containerId: container.id,
        sourceFile: entry.node.sourceFile,
        ...(entry.node.renamedFrom === undefined ? {} : { renamedFrom: entry.node.renamedFrom }),
        initialization: entry.node.initialization,
        changeType: entry.node.changeType,
        [mismatchKey]: true,
      };
      codeReview.nodes.push(node);
    }
  }
  codeReview.containers = codeReview.containers.filter((container) => container.generatedBy !== generator ||
    codeReview.nodes.some((node) => node.containerId === container.id) ||
    codeReview.relationships.some((relationship) => relationship.from.containerId === container.id || relationship.to.containerId === container.id),
  );

  const annotatedFunctions = functionEntries(codeReview);
  const functionsByIdentity = new Map(annotatedFunctions.map((entry) => [entry.key, entry]));
  for (const element of Object.values(annotatedPatch.elements)) {
    if (element.kind === "method") {
      const identities = patchFunctionIdentities(element, annotatedPatch.elements, files, annotatedFunctions);
      const parent = annotatedPatch.elements[element.parentId];
      const mismatch = identities.some((identity) => {
        const entry = functionsByIdentity.get(JSON.stringify(identity));
        return entry?.node[mismatchKey] &&
          ((parent.kind === "class" && entry.container.type === "class") ||
            (parent.kind === "file" && entry.container.type === "module"));
      });
      const tags = (element.tags ?? []).filter((tag) => tag !== mismatchKey);
      if (mismatch) tags.push(mismatchKey);
      if (element.tags !== undefined || tags.length > 0) element.tags = tags;
    }
  }

  validateResult(codeReview, validateDataflow, "CR implementation dataflow");
  const errors = implementationDataflowErrors(codeReview);
  if (errors.length > 0) throw new Error(`CR implementation dataflow is invalid:\n${errors.join("\n")}`);
  validateResult(annotatedPatch, validateEnrichedPatch, "Enriched patch");
  return { codeReview, enrichedPatch: annotatedPatch };
}

async function main() {
  const args = process.argv.slice(2);
  if (args.length !== 5 || args[3] !== "--enriched-patch") {
    console.error("Usage: node annotate-hld-function-coverage.mjs <hld-impl-dataflow> <cr-impl-dataflow> <patch> --enriched-patch <enriched-patch>");
    process.exitCode = 1;
  } else {
    const [hld, review, patch, enrichedPatch] = await Promise.all([args[0], args[1], args[2], args[4]].map((file) => readFile(file, "utf8")));
    const result = annotateHldFunctionCoverage(JSON.parse(hld), JSON.parse(review), patch, JSON.parse(enrichedPatch));
    await writeFile(args[1], `${JSON.stringify(result.codeReview, null, 2)}\n`);
    await writeFile(args[4], `${JSON.stringify(result.enrichedPatch, null, 2)}\n`);
    console.log(`Annotated HLD function coverage: ${args[1]}, ${args[4]}`);
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
