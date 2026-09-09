import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import Ajv2020 from "ajv/dist/2020.js";

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const toolkitDirectory = path.resolve(scriptDirectory, "..");
const inputArguments = process.argv.slice(2);

if (inputArguments.length !== 1) {
  console.error(
    "Usage: node ai-coding-toolkit/scripts/validate-change-structure.mjs <change-structure.json>"
  );
  process.exitCode = 1;
} else {
  const inputPath = path.resolve(process.cwd(), inputArguments[0]);
  const schemaPath = path.join(toolkitDirectory, "schemas", "change-structure.schema.json");

  try {
    const schema = JSON.parse(await readFile(schemaPath, "utf8"));
    const changeStructure = JSON.parse(await readFile(inputPath, "utf8"));
    const validate = new Ajv2020({ allErrors: true }).compile(schema);
    const schemaIsValid = validate(changeStructure);

    if (!schemaIsValid) {
      for (const error of validate.errors) {
        const location = error.instancePath || "/";
        console.error(`${location}: ${error.message}`);
      }
      process.exitCode = 1;
    } else {
      const semanticErrors = [];
      const classNames = new Set();

      for (const classChange of changeStructure.classes) {
        if (classNames.has(classChange.name)) {
          semanticErrors.push(`Duplicate class name: ${classChange.name}`);
        } else {
          classNames.add(classChange.name);
        }

        const methodNames = new Set();
        for (const method of classChange.methods) {
          if (methodNames.has(method.name)) {
            semanticErrors.push(`Duplicate method name in ${classChange.name}: ${method.name}`);
          } else {
            methodNames.add(method.name);
          }
        }
      }

      for (const relationship of changeStructure.relationships) {
        if (!classNames.has(relationship.from)) {
          semanticErrors.push(`Unknown relationship source class: ${relationship.from}`);
        }
        if (!classNames.has(relationship.to)) {
          semanticErrors.push(`Unknown relationship target class: ${relationship.to}`);
        }
      }

      if (semanticErrors.length > 0) {
        for (const error of semanticErrors) {
          console.error(error);
        }
        process.exitCode = 1;
      } else {
        console.log(`Valid change structure: ${inputPath}`);
      }
    }
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
