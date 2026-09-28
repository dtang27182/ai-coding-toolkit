import { readFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";

import Ajv2020 from "ajv/dist/2020.js";

import { parsePatch } from "../../common/enriched-patch/generate-enriched-patch.mjs";

const schema = JSON.parse(await readFile(new URL("../../common/enriched-patch/enriched-patch.schema.json", import.meta.url), "utf8"));
const validateSchema = new Ajv2020({ allErrors: true }).compile(schema);

function rowKey(file, side, line) {
  return JSON.stringify([file, side, line]);
}

export function changeOwnershipErrors(index) {
  const owners = new Map();
  const errors = [];

  for (const file of parsePatch(index.patch)) {
    const fileName = file.newPath ?? file.oldPath;
    for (const row of file.rows) {
      if (row.kind === "delete") {
        owners.set(rowKey(fileName, "old", row.oldLine), []);
      } else if (row.kind === "add") {
        owners.set(rowKey(fileName, "new", row.newLine), []);
      }
    }
  }

  for (const [id, element] of Object.entries(index.elements)) {
    const fileName = element.kind === "file" ? element.name : element.locations[0].file;
    for (const change of element.changes ?? []) {
      for (const side of ["old", "new"]) {
        const range = change[`${side}Lines`];
        if (range !== null) {
          for (let line = range[0]; line <= range[1]; line += 1) {
            const key = rowKey(fileName, side, line);
            if (owners.has(key)) {
              owners.get(key).push(id);
            } else {
              errors.push(`${id} assigns ${fileName} ${side} line ${line}, which is not a changed patch row.`);
            }
          }
        }
      }
    }
  }

  for (const [key, ids] of owners) {
    const [fileName, side, line] = JSON.parse(key);
    if (ids.length === 0) {
      errors.push(`${fileName} ${side} line ${line} is not assigned to a change.`);
    } else if (ids.length > 1) {
      errors.push(`${fileName} ${side} line ${line} is assigned more than once: ${ids.join(", ")}.`);
    }
  }
  return errors;
}

async function main() {
  const fileArgument = process.argv[2];
  if (fileArgument === undefined || process.argv.length !== 3) {
    console.error("Usage: node validate-enriched-patch.mjs <enriched-patch.json>");
    process.exitCode = 1;
  } else {
    const index = JSON.parse(await readFile(fileArgument, "utf8"));
    if (!validateSchema(index)) {
      const details = (validateSchema.errors ?? []).map((error) => `${error.instancePath || "/"}: ${error.message}`);
      throw new Error(`Enriched Patch does not match its schema:\n${details.join("\n")}`);
    }
    const errors = changeOwnershipErrors(index);
    if (errors.length > 0) {
      throw new Error(`Enriched Patch change ownership is invalid:\n${errors.join("\n")}`);
    }
    console.log(`Validated Enriched Patch: ${path.resolve(fileArgument)}`);
  }
}

if (process.argv[1] !== undefined && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  await main();
}
