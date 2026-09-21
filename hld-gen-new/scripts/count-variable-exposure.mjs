import { spawnSync } from "node:child_process";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const validatorPath = path.join(scriptDirectory, "validate-architecture-diff.mjs");
const inputArguments = process.argv.slice(2);

if (inputArguments.length !== 1) {
  console.error(
    "Usage: node ai-coding-toolkit/hld-gen-new/scripts/count-variable-exposure.mjs <architecture-diff.json>"
  );
  process.exitCode = 1;
} else {
  const inputPath = path.resolve(process.cwd(), inputArguments[0]);
  const validationResult = spawnSync(process.execPath, [validatorPath, inputPath], {
    encoding: "utf8",
  });

  if (validationResult.status !== 0) {
    process.stderr.write(validationResult.stderr);
    process.exitCode = 1;
  } else {
    const architectureDiff = JSON.parse(await readFile(inputPath, "utf8"));
    const exposedVariables = new Set();
    let variableExposureIsKnown = true;

    for (const classDiff of architectureDiff.classes) {
      if (classDiff.variableExposure === null) {
        classDiff.variableExposureCount = null;
        variableExposureIsKnown = false;
      } else if (Array.isArray(classDiff.variableExposure)) {
        classDiff.variableExposureCount = classDiff.variableExposure.length;
        for (const variable of classDiff.variableExposure) {
          exposedVariables.add(JSON.stringify([
            variable.declaredAt.file,
            variable.declaredAt.line,
            variable.declaredAt.column,
          ]));
        }
      }
    }

    architectureDiff.variableExposureCount = variableExposureIsKnown ? exposedVariables.size : null;
    await writeFile(inputPath, `${JSON.stringify(architectureDiff, null, 2)}\n`);
    console.log(`Updated variable exposure count: ${inputPath}`);
  }
}
