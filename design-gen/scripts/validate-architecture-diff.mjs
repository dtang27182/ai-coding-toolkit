import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import Ajv2020 from "ajv/dist/2020.js";

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const hldGeneratorDirectory = path.resolve(scriptDirectory, "..");
const inputArguments = process.argv.slice(2);

if (inputArguments.length !== 1) {
  console.error(
    "Usage: node ai-coding-toolkit/design-gen/scripts/validate-architecture-diff.mjs <architecture-diff.json>"
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
      const nodeNames = new Map();
      const classMethods = new Map();
      const classStateVariables = new Map();
      const componentNames = new Set();

      for (const classDiff of architectureDiff.classes) {
        if (nodeNames.has(classDiff.name)) {
          semanticErrors.push(`Duplicate class name: ${classDiff.name}`);
        } else {
          nodeNames.set(classDiff.name, classDiff);
        }

        const methodNames = new Map();
        classMethods.set(classDiff.name, methodNames);
        for (const method of classDiff.methods) {
          if (
            classDiff.changeType === "unchanged" &&
            (method.changeType === "added" || method.changeType === "modified" || method.changeType === "deleted")
          ) {
            semanticErrors.push(`Unchanged class has changed method: ${classDiff.name}.${method.name}`);
          }
          if (methodNames.has(method.name)) {
            semanticErrors.push(`Duplicate method name in ${classDiff.name}: ${method.name}`);
          } else {
            methodNames.set(method.name, method);
          }
        }

        const stateVariableNames = new Map();
        classStateVariables.set(classDiff.name, stateVariableNames);
        for (const stateVariable of classDiff.stateVariables) {
          if (
            classDiff.changeType === "unchanged" &&
            (stateVariable.changeType === "added" || stateVariable.changeType === "modified" || stateVariable.changeType === "deleted")
          ) {
            semanticErrors.push(`Unchanged class has changed state variable: ${classDiff.name}.${stateVariable.name}`);
          }
          if (stateVariableNames.has(stateVariable.name)) {
            semanticErrors.push(`Duplicate state variable name in ${classDiff.name}: ${stateVariable.name}`);
          } else {
            stateVariableNames.set(stateVariable.name, stateVariable);
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

      const flowNames = new Set();
      for (const userFlow of architectureDiff.userFlows) {
        if (flowNames.has(userFlow.name)) {
          semanticErrors.push(`Duplicate user flow name: ${userFlow.name}`);
        }
        flowNames.add(userFlow.name);
        userFlow.steps.forEach((step, index) => {
          if (step.id !== index + 1) {
            semanticErrors.push(
              `Steps in user flow "${userFlow.name}" must be numbered 1..n in order; found ${step.id} at position ${index + 1}`
            );
          }
        });
      }

      for (const component of architectureDiff.components) {
        componentNames.add(component.name);
        if (nodeNames.has(component.name)) {
          semanticErrors.push(`Duplicate class or component name: ${component.name}`);
        } else {
          nodeNames.set(component.name, component);
        }
      }

      for (const relationship of architectureDiff.relationships) {
        for (const endpoint of [relationship.from, relationship.to]) {
          if (endpoint.component !== undefined) {
            if (!componentNames.has(endpoint.component)) {
              semanticErrors.push(`Unknown relationship component: ${endpoint.component}`);
            } else if (relationship.userFlow && !nodeNames.get(endpoint.component).userFlow) {
              semanticErrors.push(`User-flow relationship references a supporting component: ${endpoint.component}`);
            }
          } else if (endpoint.class !== undefined) {
            if (!classMethods.has(endpoint.class)) {
              semanticErrors.push(`Unknown relationship class: ${endpoint.class}`);
            } else if (endpoint.method !== undefined && !classMethods.get(endpoint.class).has(endpoint.method)) {
              semanticErrors.push(`Unknown relationship method in ${endpoint.class}: ${endpoint.method}`);
            } else if (endpoint.stateVariable !== undefined && !classStateVariables.get(endpoint.class).has(endpoint.stateVariable)) {
              semanticErrors.push(`Unknown relationship state variable in ${endpoint.class}: ${endpoint.stateVariable}`);
            } else if (relationship.userFlow && endpoint.method !== undefined && !classMethods.get(endpoint.class).get(endpoint.method).userFlow) {
              semanticErrors.push(`User-flow relationship references a supporting method: ${endpoint.class}.${endpoint.method}`);
            } else if (relationship.userFlow && endpoint.stateVariable !== undefined && !classStateVariables.get(endpoint.class).get(endpoint.stateVariable).userFlow) {
              semanticErrors.push(`User-flow relationship references a supporting state variable: ${endpoint.class}.${endpoint.stateVariable}`);
            }
          }
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
