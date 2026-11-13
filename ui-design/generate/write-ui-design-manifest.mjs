import { access, writeFile } from "node:fs/promises";
import path from "node:path";

const oldPath = process.argv[2];
if (oldPath === undefined || !oldPath.endsWith(".old.ui.dsl") || process.argv[3] !== undefined) {
  throw new Error("Usage: node write-ui-design-manifest.mjs <feature.old.ui.dsl>");
}

const oldUiDsl = path.resolve(oldPath);
const prefix = oldUiDsl.slice(0, -".old.ui.dsl".length);
const newUiDsl = `${prefix}.new.ui.dsl`;
const diffUiJson = `${prefix}.diff.ui.json`;
await Promise.all([oldUiDsl, newUiDsl, diffUiJson].map((file) => access(file)));
await writeFile(path.join(path.dirname(oldUiDsl), "ui-design-manifest.json"), `${JSON.stringify({ oldUiDsl, newUiDsl, diffUiJson }, null, 2)}\n`);
