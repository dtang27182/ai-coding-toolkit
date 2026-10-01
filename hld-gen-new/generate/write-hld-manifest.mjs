import { access, writeFile } from "node:fs/promises";
import path from "node:path";

const hldPath = process.argv[2];
if (hldPath === undefined || !hldPath.endsWith(".hld.md")) {
  throw new Error("Usage: node write-hld-manifest.mjs <feature.hld.md>");
}

const hld = path.resolve(hldPath);
const prefix = hld.slice(0, -".hld.md".length);
const sysDataflow = `${prefix}.sys-dataflow.json`;
const implDataflow = `${prefix}.impl-dataflow.json`;
await Promise.all([hld, sysDataflow, implDataflow].map((file) => access(file)));
await writeFile(`${prefix}.hld-manifest.json`, `${JSON.stringify({ hld, sysDataflow, implDataflow }, null, 2)}\n`);
