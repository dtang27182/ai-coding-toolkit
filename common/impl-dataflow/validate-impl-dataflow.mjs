import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import Ajv2020 from "ajv/dist/2020.js";

import { implementationDataflowErrors } from "./semantic-errors.mjs";

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const toolkitDirectory = path.resolve(scriptDirectory, "../..");
const inputArguments = process.argv.slice(2);
let evaluated = false;
let inputArgument;

if (inputArguments.length === 1) {
  inputArgument = inputArguments[0];
} else if (inputArguments.length === 2 && inputArguments[0] === "--evaluated") {
  evaluated = true;
  inputArgument = inputArguments[1];
}

if (inputArgument === undefined) {
  console.error(
    "Usage: node validate-impl-dataflow.mjs [--evaluated] <impl-dataflow.json>"
  );
  process.exitCode = 1;
} else {
  const inputPath = path.resolve(process.cwd(), inputArgument);
  const schemaPath = path.join(
    toolkitDirectory,
    "common",
    "impl-dataflow",
    "impl-dataflow.schema.json"
  );

  try {
    const schema = JSON.parse(await readFile(schemaPath, "utf8"));
    const implementationDataflow = JSON.parse(await readFile(inputPath, "utf8"));
    const validate = new Ajv2020({ allErrors: true }).compile(schema);
    const schemaIsValid = validate(implementationDataflow);

    if (!schemaIsValid) {
      for (const error of validate.errors) {
        const location = error.instancePath || "/";
        console.error(`${location}: ${error.message}`);
      }
      process.exitCode = 1;
    } else {
      const semanticErrors = implementationDataflowErrors(implementationDataflow, evaluated);

      if (semanticErrors.length > 0) {
        for (const error of semanticErrors) {
          console.error(error);
        }
        process.exitCode = 1;
      } else {
        console.log(`Valid implementation dataflow: ${inputPath}`);
      }
    }
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
