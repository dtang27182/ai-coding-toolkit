import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const toolkitDirectory = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const generatorPath = path.join(toolkitDirectory, "hld-gen/scripts/architecture-diff-to-mermaid.mjs");
const examplePath = path.join(toolkitDirectory, "hld-gen/references/architecture-diff.example.json");

async function generateDiagram(t, architectureDiff) {
  const directory = await mkdtemp(path.join(os.tmpdir(), "mermaid-test-"));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const inputPath = path.join(directory, "design.json");
  await writeFile(inputPath, JSON.stringify(architectureDiff));
  const result = spawnSync(process.execPath, [generatorPath, inputPath], { encoding: "utf8" });
  assert.equal(result.status, 0, result.stderr);
  assert.deepEqual(JSON.parse(await readFile(inputPath, "utf8")), architectureDiff);
  return readFile(path.join(directory, "design.mermaid.md"), "utf8");
}

test("omits composition while preserving data flows, boundary markers, and edge styles", async (t) => {
  const architectureDiff = JSON.parse(await readFile(examplePath, "utf8"));
  architectureDiff.relationships[1].label = "owns model";
  architectureDiff.relationships.push(
    { from: "Repository", to: "ChangeModel", type: "composition", changeType: "deleted", label: "owned model" },
    { from: "ChangeService", to: "ChangeModel", type: "dataflow", changeType: "modified", label: "changes" },
    { from: "ChangeModel", to: "Repository", type: "dataflow", changeType: "added", label: "saved changes" }
  );
  const markdown = await generateDiagram(t, architectureDiff);
  const diagram = markdown.split("```mermaid\n")[1].split("```")[0];
  assert.doesNotMatch(diagram, /owns model|owned model|composition|\.->/);
  for (const classDiff of architectureDiff.classes) {
    assert.ok(diagram.includes(classDiff.name));
  }
  for (const label of ["source files", "legacy source files", "changes", "saved changes"]) {
    assert.equal(diagram.split(`|"${label}"|`).length - 1, 1);
  }
  assert.equal(diagram.match(/-->/g).length, 7);
  assert.equal(diagram.match(/\(\(" "\)\)/g).length, 3);
  const styles = [...diagram.matchAll(/linkStyle (\d+) (.+)/g)];
  assert.deepEqual(styles.map((match) => Number(match[1])), [0, 1, 2, 3, 4, 5, 6]);
  assert.deepEqual(styles.map((match) => match[2].match(/stroke:(#[a-f0-9]+)/)[1]), [
    "#64748b", "#64748b", "#b91c1c", "#b91c1c", "#b45309", "#15803d", "#15803d",
  ]);
  assert.match(styles[2][2], /stroke-dasharray/);
  assert.match(styles[3][2], /stroke-dasharray/);
  assert.match(markdown, /composition relationships are omitted/);
});

test("keeps classes visible when all relationships are composition", async (t) => {
  const architectureDiff = JSON.parse(await readFile(examplePath, "utf8"));
  architectureDiff.relationships = architectureDiff.relationships.filter(
    (relationship) => relationship.type === "composition"
  );
  const markdown = await generateDiagram(t, architectureDiff);
  const diagram = markdown.split("```mermaid\n")[1].split("```")[0];
  assert.doesNotMatch(diagram, /-->|\.->|linkStyle|\(\(" "\)\)/);
  for (const classDiff of architectureDiff.classes) {
    assert.ok(diagram.includes(classDiff.name));
  }
});
