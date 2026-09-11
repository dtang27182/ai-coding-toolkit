import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import Ajv2020 from "ajv/dist/2020.js";

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const hldGeneratorDirectory = path.resolve(scriptDirectory, "..");
const inputArguments = process.argv.slice(2);

if (inputArguments.length !== 1) {
  console.error(
    "Usage: node ai-coding-toolkit/hld-gen/scripts/validate-architecture-diff.mjs <architecture-diff.json>"
  );
  process.exitCode = 1;
} else {
  const inputPath = path.resolve(process.cwd(), inputArguments[0]);
  const schemaPath = path.join(
    hldGeneratorDirectory,
    "references",
    "architecture-diff.schema.json"
  );

  try {
    const schema = JSON.parse(await readFile(schemaPath, "utf8"));
    const architectureDiff = JSON.parse(await readFile(inputPath, "utf8"));
    const validate = new Ajv2020({ allErrors: true }).compile(schema);
    const schemaIsValid = validate(architectureDiff);

    if (!schemaIsValid) {
      for (const error of validate.errors) {
        const location = error.instancePath || "/";
        console.error(`${location}: ${error.message}`);
      }
      process.exitCode = 1;
    } else {
      const semanticErrors = [];
      const nodeNames = new Set();

      for (const classDiff of architectureDiff.classes) {
        if (nodeNames.has(classDiff.name)) {
          semanticErrors.push(`Duplicate class name: ${classDiff.name}`);
        } else {
          nodeNames.add(classDiff.name);
        }

        const methodNames = new Set();
        for (const method of classDiff.methods) {
          if (methodNames.has(method.name)) {
            semanticErrors.push(`Duplicate method name in ${classDiff.name}: ${method.name}`);
          } else {
            methodNames.add(method.name);
          }
        }

        if (Array.isArray(classDiff.variableExposure)) {
          const classExposedVariables = new Set();
          if (classDiff.changeType === "unchanged" && classDiff.variableExposure.length > 0) {
            semanticErrors.push(`Unchanged context class has variable exposure: ${classDiff.name}`);
          }
          for (const variable of classDiff.variableExposure) {
            if (
              path.posix.isAbsolute(variable.declaredAt.file) ||
              path.win32.isAbsolute(variable.declaredAt.file) ||
              variable.declaredAt.file.includes("\\") ||
              path.posix.normalize(variable.declaredAt.file) !== variable.declaredAt.file ||
              variable.declaredAt.file === "." ||
              variable.declaredAt.file === ".." ||
              variable.declaredAt.file.startsWith("../")
            ) {
              semanticErrors.push(`Variable declaration path must be canonical and repository-relative: ${variable.declaredAt.file}`);
            }
            const declarationId = JSON.stringify([
              variable.declaredAt.file,
              variable.declaredAt.line,
              variable.declaredAt.column,
            ]);
            if (classExposedVariables.has(declarationId)) {
              semanticErrors.push(`Duplicate exposed variable in ${classDiff.name}: ${variable.name}`);
            }
            classExposedVariables.add(declarationId);
          }
        }
      }

      for (const component of architectureDiff.components) {
        if (nodeNames.has(component.name)) {
          semanticErrors.push(`Duplicate class or component name: ${component.name}`);
        } else {
          nodeNames.add(component.name);
        }
      }

      for (const relationship of architectureDiff.relationships) {
        if (!nodeNames.has(relationship.from)) {
          semanticErrors.push(`Unknown relationship source class or component: ${relationship.from}`);
        }
        if (!nodeNames.has(relationship.to)) {
          semanticErrors.push(`Unknown relationship target class or component: ${relationship.to}`);
        }
      }

      if (semanticErrors.length > 0) {
        for (const error of semanticErrors) {
          console.error(error);
        }
        process.exitCode = 1;
      } else {
        console.log(`Valid architecture diff: ${inputPath}`);
      }
    }
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
