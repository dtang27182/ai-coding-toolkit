import { access, writeFile } from "node:fs/promises";
import path from "node:path";

const hldPath = process.argv[2];
const detailedRequirementsPath = process.argv[3];
if (hldPath === undefined || !hldPath.endsWith(".hld.md") ||
  detailedRequirementsPath === undefined || !detailedRequirementsPath.endsWith(".detailed-requirements.md")) {
  throw new Error("Usage: node write-hld-manifest.mjs <feature.hld.md> <feature.detailed-requirements.md>");
}

const hld = path.resolve(hldPath);
const prefix = hld.slice(0, -".hld.md".length);
const sysDataflow = `${prefix}.sys-dataflow.json`;
const implDataflow = `${prefix}.impl-dataflow.json`;
const detailedRequirements = path.resolve(detailedRequirementsPath);
await Promise.all([hld, sysDataflow, implDataflow, detailedRequirements].map((file) => access(file)));
await writeFile(`${prefix}.hld-manifest.json`, `${JSON.stringify({ hld, sysDataflow, implDataflow, detailedRequirements }, null, 2)}\n`);
