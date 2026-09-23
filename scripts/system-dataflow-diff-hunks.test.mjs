import assert from "node:assert/strict";
import test from "node:test";
import {
  diffstatBoxes,
  hunkLocation,
  hunkReferences,
  lineIndent,
  parseHunk,
  renderDiffSection,
} from "../common/system-dataflow/visualizer/src/diff.ts";

const plannerPatch = [
  "@@ -42,5 +42,6 @@ export class DeliveryPlanner {",
  "   rankOptions(plans) {",
  "-    return plans",
  "-      .sort(byPrice);",
  "+    const priced = plans.map(price);",
  "+    return removeDominated(priced)",
  "+      .sort(byScore);",
  "   }",
].join("\n");

function node(name, diffHunkIds) {
  const value = { type: "data-processing", name, description: `${name} description`, medium: "TypeScript", location: name, algorithm: "Transform." };
  if (diffHunkIds !== undefined) value.diffHunkIds = diffHunkIds;
  return value;
}

function relationship(id, from, to, diffHunkIds) {
  const value = { id, from, to, type: "dataflow", data: `${id} data`, purpose: `${id} purpose` };
  if (diffHunkIds !== undefined) value.diffHunkIds = diffHunkIds;
  return value;
}

/** Ranker cites two hunks; Policy and the policy-to-ranker flow share a third; Display cites none. */
function codeReviewDataflow() {
  return {
    schemaVersion: 2,
    stage: "code-review",
    feature: "Diff hunk rendering",
    diffHunks: [
      { id: "hunk-planner", file: "src/delivery/planner.ts", patch: plannerPatch },
      { id: "hunk-score", file: "src/delivery/score.ts", patch: "@@ -0,0 +1,2 @@\n+export const score = 1;\n+export const weight = 2;" },
      { id: "hunk-policy", file: "config/policy.yaml", patch: "@@ -3,2 +3,3 @@ handling:\n   days: 1\n+  splitPenalty: 450\n window: 7" },
    ],
    nodes: [
      node("Ranker", ["hunk-planner", "hunk-score"]),
      node("Policy", ["hunk-policy"]),
      node("Display"),
    ],
    relationships: [
      relationship("policy-to-ranker", "Policy", "Ranker", ["hunk-policy"]),
      relationship("ranker-to-display", "Ranker", "Display"),
    ],
  };
}

function render(owner, hunkIds, overrides = {}) {
  return renderDiffSection(owner, hunkIds, {
    dataflow: codeReviewDataflow(),
    openHunk: undefined,
    badge: (nodeType) => `<badge ${nodeType}>`,
    colors: { added: "ADD-COLOUR", deleted: "DEL-COLOUR" },
    ...overrides,
  });
}

const count = (html, fragment) => html.split(fragment).length - 1;
const expandedStates = (html) => [...html.matchAll(/aria-expanded="(true|false)"/g)].map((match) => match[1]);
const ranker = { type: "node", name: "Ranker" };
const policy = { type: "node", name: "Policy" };
const policyFlow = { type: "relationship", id: "policy-to-ranker" };

// --- parsing ----------------------------------------------------------------

test("parses a hunk's header ranges, function context and signed lines", () => {
  const hunk = parseHunk(plannerPatch);
  assert.deepEqual(
    { oldStart: hunk.oldStart, oldCount: hunk.oldCount, newStart: hunk.newStart, newCount: hunk.newCount },
    { oldStart: 42, oldCount: 5, newStart: 42, newCount: 6 },
  );
  assert.equal(hunk.context, "export class DeliveryPlanner {");
  assert.deepEqual(hunk.lines.map((line) => line.kind), ["context", "del", "del", "add", "add", "add", "context"]);
  assert.equal(hunk.lines[1].text, "    return plans");
  assert.deepEqual([hunk.added, hunk.removed], [3, 2]);
});

test("a header without line counts means a count of one", () => {
  const hunk = parseHunk("@@ -1 +1 @@\n-old\n+new");
  assert.deepEqual([hunk.oldStart, hunk.oldCount, hunk.newStart, hunk.newCount, hunk.context], [1, 1, 1, 1, ""]);
});

test("a no-newline marker is a meta line, not an addition or removal", () => {
  const hunk = parseHunk("@@ -1 +1 @@\n-old\n+new\n\\ No newline at end of file");
  assert.deepEqual(hunk.lines.at(-1), { kind: "meta", text: "No newline at end of file" });
  assert.deepEqual([hunk.added, hunk.removed], [1, 1]);
});

test("CRLF line endings and a trailing newline add no stray lines", () => {
  const hunk = parseHunk("@@ -1,2 +1,2 @@\r\n context\r\n-old\r\n+new\r\n");
  assert.deepEqual(hunk.lines, [
    { kind: "context", text: "context" },
    { kind: "del", text: "old" },
    { kind: "add", text: "new" },
  ]);
});

test("blank lines inside a hunk stay as empty context lines", () => {
  const hunk = parseHunk("@@ -1,3 +1,3 @@\n first\n \n last");
  assert.deepEqual(hunk.lines.map((line) => [line.kind, line.text]), [["context", "first"], ["context", ""], ["context", "last"]]);
});

// --- location label -----------------------------------------------------------

test("location prefers the function context from the header", () => {
  assert.equal(hunkLocation(parseHunk(plannerPatch)), "export class DeliveryPlanner {");
});

test("location names new and deleted files", () => {
  assert.equal(hunkLocation(parseHunk("@@ -0,0 +1,3 @@\n+a\n+b\n+c")), "new file");
  assert.equal(hunkLocation(parseHunk("@@ -1,2 +0,0 @@\n-a\n-b")), "deleted file");
});

test("without context, location falls back to the changed line range", () => {
  assert.equal(hunkLocation(parseHunk("@@ -10,2 +12,4 @@\n a\n+b\n+c\n d")), "lines 12–15");
  assert.equal(hunkLocation(parseHunk("@@ -1 +1 @@\n-a\n+b")), "line 1");
  assert.equal(hunkLocation(parseHunk("@@ -10,3 +9,0 @@\n-a\n-b\n-c")), "lines 10–12");
});

// --- shared references --------------------------------------------------------

test("references collect every node and relationship citing a hunk", () => {
  const references = hunkReferences(codeReviewDataflow());
  assert.deepEqual(references.get("hunk-policy"), [policy, policyFlow]);
  assert.deepEqual(references.get("hunk-planner"), [ranker]);
  assert.equal(references.size, 3);
});

test("a dataflow with no hunk references yields no references", () => {
  const dataflow = { ...codeReviewDataflow(), stage: "high-level-design", diffHunks: undefined };
  dataflow.nodes = dataflow.nodes.map(({ diffHunkIds, ...rest }) => rest);
  dataflow.relationships = dataflow.relationships.map(({ diffHunkIds, ...rest }) => rest);
  assert.equal(hunkReferences(dataflow).size, 0);
});

// --- diffstat and indentation ---------------------------------------------------

test("diffstat splits five boxes between additions and removals", () => {
  assert.deepEqual(diffstatBoxes(3, 0), ["add", "add", "add", "add", "add"]);
  assert.deepEqual(diffstatBoxes(0, 4), ["del", "del", "del", "del", "del"]);
  assert.deepEqual(diffstatBoxes(3, 2), ["add", "add", "add", "del", "del"]);
  assert.deepEqual(diffstatBoxes(0, 0), ["", "", "", "", ""]);
});

test("indent counts leading spaces, with a tab as two", () => {
  assert.equal(lineIndent("    return plans"), 4);
  assert.equal(lineIndent("\treturn"), 2);
  assert.equal(lineIndent("\t  return"), 4);
  assert.equal(lineIndent("return"), 0);
});

// --- the Relevant diff section --------------------------------------------------

test("entities without hunk references render no diff section", () => {
  assert.equal(render({ type: "node", name: "Display" }, undefined), "");
  assert.equal(render({ type: "relationship", id: "ranker-to-display" }, []), "");
});

test("a node's section lists its hunks in order, with totals and a count", () => {
  const html = render(ranker, ["hunk-planner", "hunk-score"]);
  assert.equal(count(html, 'class="hunk"'), 2);
  assert.ok(html.indexOf("planner.ts") < html.indexOf("score.ts"));
  assert.match(html, /Relevant diff<\/span><span class="diff-counts"><span class="diff-add">\+5<\/span> <span class="diff-del">−2<\/span><\/span><span class="inspector-count">2<\/span>/);
  assert.match(html, /<span class="hunk-location">export class DeliveryPlanner \{<\/span>/);
  assert.match(html, /<span class="hunk-location">new file<\/span>/);
});

test("a relationship's section renders the hunks it cites", () => {
  const html = render(policyFlow, ["hunk-policy"]);
  assert.equal(count(html, 'class="hunk"'), 1);
  assert.match(html, /<span class="hunk-dir">config\/<\/span>policy\.yaml/);
  assert.equal(count(html, 'class="hunk-line add"'), 1);
});

test("the first hunk opens by default and only it shows code", () => {
  const html = render(ranker, ["hunk-planner", "hunk-score"]);
  assert.deepEqual(expandedStates(html), ["true", "false"]);
  assert.equal(count(html, 'class="hunk-body"'), 1);
  assert.equal(count(html, 'class="hunk-line add"'), 3);
  assert.equal(count(html, 'class="hunk-line del"'), 2);
});

test("the remembered choice for this entity decides which hunk is open", () => {
  const html = render(ranker, ["hunk-planner", "hunk-score"], { openHunk: { owner: "node:Ranker", id: "hunk-score" } });
  assert.deepEqual(expandedStates(html), ["false", "true"]);
});

test("a null choice collapses every hunk", () => {
  const html = render(ranker, ["hunk-planner", "hunk-score"], { openHunk: { owner: "node:Ranker", id: null } });
  assert.deepEqual(expandedStates(html), ["false", "false"]);
  assert.equal(count(html, 'class="hunk-body"'), 0);
});

test("a choice remembered for another entity is ignored", () => {
  const html = render(ranker, ["hunk-planner", "hunk-score"], { openHunk: { owner: "node:Policy", id: null } });
  assert.deepEqual(expandedStates(html), ["true", "false"]);
});

test("toggles carry what a click should open: nothing for the open row, the id for the others", () => {
  const html = render(ranker, ["hunk-planner", "hunk-score"]);
  const toggles = [...html.matchAll(/data-hunk-owner="([^"]*)" data-hunk-open="([^"]*)"/g)].map((match) => [match[1], match[2]]);
  assert.deepEqual(toggles, [["node:Ranker", ""], ["node:Ranker", "hunk-score"]]);
});

test("a shared hunk links to its other owners but never back to the one shown", () => {
  const fromNode = render(policy, ["hunk-policy"]);
  assert.match(fromNode, /shared ×1/);
  assert.match(fromNode, /data-jump-relationship="policy-to-ranker"/);
  assert.doesNotMatch(fromNode, /data-jump-node="Policy"/);

  const fromRelationship = render(policyFlow, ["hunk-policy"]);
  assert.match(fromRelationship, /data-jump-node="Policy"><badge data-processing><span>Policy<\/span>/);
  assert.doesNotMatch(fromRelationship, /data-jump-relationship="policy-to-ranker"/);
});

test("a hunk cited only once shows no sharing", () => {
  const html = render(ranker, ["hunk-planner"]);
  assert.doesNotMatch(html, /shared ×/);
  assert.doesNotMatch(html, /Also used by/);
});

test("a reference to a missing hunk shows an explicit row and adds nothing to the totals", () => {
  const html = render(ranker, ["hunk-planner", "hunk-gone"]);
  assert.match(html, /<p class="hunk-missing">hunk-gone is not in diffHunks<\/p>/);
  assert.match(html, /<span class="diff-add">\+3<\/span> <span class="diff-del">−2<\/span><\/span><span class="inspector-count">2<\/span>/);
});

test("file paths and code are escaped", () => {
  const dataflow = codeReviewDataflow();
  dataflow.diffHunks[0] = { id: "hunk-planner", file: "src/a&b/<x>.ts", patch: '@@ -1 +1 @@\n-<script>alert("x")</script>\n+const a = 1 && b;' };
  const html = render(ranker, ["hunk-planner"], { dataflow });
  assert.doesNotMatch(html, /<script>|<x>/);
  assert.match(html, /&lt;script&gt;alert\(&quot;x&quot;\)&lt;\/script&gt;/);
  assert.match(html, /a&amp;b\/<\/span>&lt;x&gt;\.ts/);
  assert.match(html, /1 &amp;&amp; b/);
});

test("code lines keep their indentation for wrapping, and colours come from the caller", () => {
  const html = render(ranker, ["hunk-planner"]);
  assert.match(html, /style="--indent:4ch">    return plans<\/span>/);
  assert.match(html, /style="--added:ADD-COLOUR;--deleted:DEL-COLOUR"/);
});
