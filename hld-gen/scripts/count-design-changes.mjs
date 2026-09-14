import { spawnSync } from "node:child_process";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const validatorPath = path.join(scriptDirectory, "validate-architecture-diff.mjs");
const inputArguments = process.argv.slice(2);

function isChanged(entry) {
  return entry.changeType === "added" || entry.changeType === "modified" || entry.changeType === "deleted";
}

if (inputArguments.length !== 1) {
  console.error(
    "Usage: node ai-coding-toolkit/hld-gen/scripts/count-design-changes.mjs <architecture-diff.json>"
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
    const changedClasses = architectureDiff.classes.filter(isChanged);

    architectureDiff.changedClassCount = changedClasses.length;
    architectureDiff.changedMethodCount = changedClasses.reduce(
      (count, classDiff) => count + classDiff.methods.filter(isChanged).length,
      0
    );
    architectureDiff.changedComponentCount = architectureDiff.components.filter(isChanged).length;
    architectureDiff.changedDataflowRelationshipCount = architectureDiff.relationships.filter(
      (relationship) => relationship.type === "dataflow" && isChanged(relationship)
    ).length;
    architectureDiff.changedStateUpdateRelationshipCount = architectureDiff.relationships.filter(
      (relationship) => relationship.type === "state-update" && isChanged(relationship)
    ).length;

    await writeFile(inputPath, `${JSON.stringify(architectureDiff, null, 2)}\n`);
    console.log(`Updated design change counts: ${inputPath}`);
  }
}
