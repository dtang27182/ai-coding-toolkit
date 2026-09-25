import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import Ajv2020 from "ajv/dist/2020.js";

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
    "Usage: node ai-coding-toolkit/hld-gen-new/eval/validate-impl-dataflow.mjs [--evaluated] <impl-dataflow.json>"
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
      const semanticErrors = [];
      const nodeNames = new Map();
      const classMethods = new Map();
      const classStateVariables = new Map();
      const components = new Map();
      const staticDataNames = new Set();

      if (implementationDataflow.stage === "high-level-design" && !Array.isArray(implementationDataflow.userFlows)) {
        semanticErrors.push("High-level-design implementation dataflow requires userFlows");
      }

      for (const classDiff of implementationDataflow.classes) {
        if (nodeNames.has(classDiff.name)) {
          semanticErrors.push(`Duplicate class name: ${classDiff.name}`);
        } else {
          nodeNames.set(classDiff.name, classDiff);
        }

        const methodNames = new Map();
        classMethods.set(classDiff.name, methodNames);
        if (implementationDataflow.stage === "high-level-design" && !Object.hasOwn(classDiff, "variableExposure")) {
          semanticErrors.push(`High-level-design class requires variableExposure: ${classDiff.name}`);
        }
        for (const method of classDiff.methods) {
          if (implementationDataflow.stage === "high-level-design" && !Object.hasOwn(method, "userFlow")) {
            semanticErrors.push(`High-level-design method requires userFlow: ${classDiff.name}.${method.name}`);
          }
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
          if (implementationDataflow.stage === "high-level-design" && !Object.hasOwn(stateVariable, "userFlow")) {
            semanticErrors.push(`High-level-design state variable requires userFlow: ${classDiff.name}.${stateVariable.name}`);
          }
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
      for (const userFlow of implementationDataflow.userFlows ?? []) {
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

      for (const component of implementationDataflow.components) {
        if (implementationDataflow.stage === "high-level-design" && !Object.hasOwn(component, "userFlow")) {
          semanticErrors.push(`High-level-design component requires userFlow: ${component.name}`);
        }
        components.set(component.name, component);
        if (nodeNames.has(component.name)) {
          semanticErrors.push(`Duplicate component name: ${component.name}`);
        } else {
          nodeNames.set(component.name, component);
        }
      }

      for (const staticData of implementationDataflow.staticData) {
        if (implementationDataflow.stage === "high-level-design" && !Object.hasOwn(staticData, "userFlow")) {
          semanticErrors.push(`High-level-design static data requires userFlow: ${staticData.name}`);
        }
        staticDataNames.add(staticData.name);
        if (nodeNames.has(staticData.name)) {
          semanticErrors.push(`Duplicate static data name: ${staticData.name}`);
        } else {
          nodeNames.set(staticData.name, staticData);
        }
      }

      for (const relationship of implementationDataflow.relationships) {
        if (
          implementationDataflow.stage === "high-level-design" &&
          relationship.type !== "composition" &&
          !Object.hasOwn(relationship, "userFlow")
        ) {
          semanticErrors.push(`High-level-design ${relationship.type} relationship requires userFlow`);
        }
        for (const endpoint of [relationship.from, relationship.to]) {
          if (endpoint.component !== undefined) {
            if (!components.has(endpoint.component)) {
              semanticErrors.push(`Unknown relationship component: ${endpoint.component}`);
            } else if (endpoint === relationship.from && components.get(endpoint.component).type === "system-output") {
              semanticErrors.push(`System-output component cannot send data: ${endpoint.component}`);
            } else if (endpoint === relationship.to && components.get(endpoint.component).type === "system-input") {
              semanticErrors.push(`System-input component cannot receive data: ${endpoint.component}`);
            } else if (relationship.userFlow && !components.get(endpoint.component).userFlow) {
              semanticErrors.push(`User-flow relationship references a supporting component: ${endpoint.component}`);
            }
          } else if (endpoint.staticData !== undefined) {
            if (!staticDataNames.has(endpoint.staticData)) {
              semanticErrors.push(`Unknown relationship static data: ${endpoint.staticData}`);
            } else if (relationship.userFlow && !nodeNames.get(endpoint.staticData).userFlow) {
              semanticErrors.push(`User-flow relationship references supporting static data: ${endpoint.staticData}`);
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

      if (evaluated && implementationDataflow.stage === "code-review") {
        semanticErrors.push("--evaluated applies only to high-level-design implementation dataflows");
      } else if (evaluated && implementationDataflow.stage === "high-level-design") {
        const countNames = [
          "changedClassCount",
          "changedMethodCount",
          "changedComponentCount",
          "changedDataflowRelationshipCount",
          "changedStateUpdateRelationshipCount",
          "variableExposureCount",
        ];
        for (const countName of countNames) {
          if (!Number.isInteger(implementationDataflow[countName])) {
            semanticErrors.push(`Evaluated high-level-design implementation dataflow requires non-null ${countName}`);
          }
        }
        for (const classDiff of implementationDataflow.classes) {
          if (!Array.isArray(classDiff.variableExposure)) {
            semanticErrors.push(`Evaluated high-level-design class requires a populated variableExposure: ${classDiff.name}`);
          }
          if (!Number.isInteger(classDiff.variableExposureCount)) {
            semanticErrors.push(`Evaluated high-level-design class requires non-null variableExposureCount: ${classDiff.name}`);
          }
        }
      }

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
