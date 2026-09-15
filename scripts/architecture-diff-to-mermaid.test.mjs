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
  architectureDiff.components = [];
  architectureDiff.relationships = architectureDiff.relationships.filter(
    (relationship) => ["source files", "legacy source files"].includes(relationship.label) || relationship.type === "composition"
  );
  architectureDiff.relationships[1].label = "owns model";
  architectureDiff.relationships.push(
    { from: { class: "Repository" }, to: { class: "ChangeModel" }, type: "composition", changeType: "deleted", label: "owned model" },
    { from: { class: "ChangeService", method: "buildChangeSet" }, to: { class: "LegacyChangeAdapter", method: "adaptLegacyChange" }, type: "dataflow", userFlow: true, changeType: "modified", label: "changes" },
    { from: { class: "ChangeService", method: "buildChangeSet" }, to: { class: "Repository", method: "readSourceFiles" }, type: "dataflow", userFlow: true, changeType: "added", label: "saved changes" }
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

test("shows unchanged methods in both changed and context classes", async (t) => {
  const architectureDiff = JSON.parse(await readFile(examplePath, "utf8"));
  architectureDiff.classes[0].changeType = "modified";
  architectureDiff.classes[0].methods.push({ name: "getChangeSet", userFlow: true, changeType: "unchanged" });
  const markdown = await generateDiagram(t, architectureDiff);
  assert.ok(markdown.includes('"+ ChangeService.buildChangeSet"'));
  assert.ok(markdown.includes('"= ChangeService.getChangeSet"'));
  assert.ok(markdown.includes('"= Repository.readSourceFiles"'));
});

test("renders UI input and output and external I/O requests and results", async (t) => {
  const architectureDiff = JSON.parse(await readFile(examplePath, "utf8"));
  const markdown = await generateDiagram(t, architectureDiff);
  const diagram = markdown.split("```mermaid\n")[1].split("```")[0];
  const uiNode = diagram.match(/(\w+)\("UI: Change Panel"\)/)[1];
  const ioNode = diagram.match(/(\w+)\{\{"I\/O: Source Files on Disk"\}\}/)[1];
  const repositoryNode = diagram.match(/(\w+)\["= Repository.readSourceFiles"\]/)[1];
  assert.ok(diagram.includes(`${uiNode} -->|"user requests changes for selected files"|`));
  assert.ok(diagram.includes(`-->|"change set displayed to user"| ${uiNode}`));
  assert.ok(diagram.includes(`${repositoryNode} -->|"read file paths"| ${ioNode}`));
  assert.ok(diagram.includes(`${ioNode} -->|"file contents"| ${repositoryNode}`));
  assert.ok(diagram.includes(`class ${uiNode} added`));
  assert.ok(diagram.includes(`class ${ioNode} unchanged`));
  const changeScope = diagram.split('subgraph changeScope["Change Scope"]')[1].split("  end")[0];
  assert.ok(!changeScope.includes(uiNode));
  assert.ok(!changeScope.includes(ioNode));
  assert.doesNotMatch(diagram, /undefined/);
});

test("targets methods within their owning classes and draws state updates to classes", async (t) => {
  const architectureDiff = JSON.parse(await readFile(examplePath, "utf8"));
  architectureDiff.classes[1].methods.push({ name: "buildChangeSet", userFlow: true, changeType: "added" });
  architectureDiff.relationships = [
    { from: { class: "ChangeService", method: "buildChangeSet" }, to: { class: "ChangeModel", method: "buildChangeSet" }, type: "dataflow", userFlow: true, changeType: "added", label: "changes" },
    { from: { class: "ChangeModel", method: "buildChangeSet" }, to: { class: "ChangeModel" }, type: "state-update", userFlow: true, changeType: "added", label: "changes: store result" },
    { from: { class: "ChangeService", method: "buildChangeSet" }, to: { class: "ChangeModel" }, type: "state-update", userFlow: true, changeType: "added", label: "ready: set true" },
  ];
  const markdown = await generateDiagram(t, architectureDiff);
  const serviceMethod = markdown.match(/(\w+)\["\+ ChangeService.buildChangeSet"\]/)[1];
  const modelMethod = markdown.match(/(\w+)\["\+ ChangeModel.buildChangeSet"\]/)[1];
  const modelClass = markdown.match(/(\w+)\["ChangeModel"\]/)[1];
  assert.notEqual(serviceMethod, modelMethod);
  assert.ok(markdown.includes(`${serviceMethod} -->|"changes"| ${modelMethod}`));
  assert.ok(markdown.includes(`${modelMethod} -.->|"state update: changes: store result"| ${modelClass}`));
  assert.ok(markdown.includes(`${serviceMethod} -.->|"state update: ready: set true"| ${modelClass}`));
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
