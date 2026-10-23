import { access, writeFile } from "node:fs/promises";
import path from "node:path";

const hldPath = process.argv[2];
const detailedRequirementsPath = process.argv[3];
const includeSysDataflow = process.argv[4] === "--sys-dataflow";
if (hldPath === undefined || !hldPath.endsWith(".hld.md") ||
  detailedRequirementsPath === undefined || !detailedRequirementsPath.endsWith(".detailed-requirements.md") ||
  (process.argv[4] !== undefined && !includeSysDataflow) || process.argv[5] !== undefined) {
  throw new Error("Usage: node write-hld-manifest.mjs <feature.hld.md> <feature.detailed-requirements.md> [--sys-dataflow]");
}

const hld = path.resolve(hldPath);
const prefix = hld.slice(0, -".hld.md".length);
const sysDataflow = `${prefix}.sys-dataflow.json`;
const implDataflow = `${prefix}.impl-dataflow.json`;
const detailedRequirements = path.resolve(detailedRequirementsPath);
await Promise.all([hld, ...(includeSysDataflow ? [sysDataflow] : []), implDataflow, detailedRequirements].map((file) => access(file)));
await writeFile(`${prefix}.hld-manifest.json`, `${JSON.stringify({ hld, ...(includeSysDataflow ? { sysDataflow } : {}), implDataflow, detailedRequirements }, null, 2)}\n`);
