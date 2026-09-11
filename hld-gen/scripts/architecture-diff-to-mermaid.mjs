import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const validatorPath = path.join(scriptDirectory, "validate-architecture-diff.mjs");
const inputArguments = process.argv.slice(2);

function escapeMermaidText(value) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll('"', "&quot;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll("\n", " ");
}

function classLabel(classDiff) {
  const labelLines = [escapeMermaidText(classDiff.name)];

  for (const method of classDiff.methods) {
    let changeMarker;

    if (method.changeType === "added") {
      changeMarker = "+";
    } else if (method.changeType === "modified") {
      changeMarker = "~";
    } else if (method.changeType === "deleted") {
      changeMarker = "-";
    } else if (method.changeType === "unchanged") {
      changeMarker = "=";
    }

    labelLines.push(`${changeMarker} ${escapeMermaidText(method.name)}`);
  }

  return labelLines.join("<br/>");
}

function classNode(classDiff, nodeId) {
  return `${nodeId}["${classLabel(classDiff)}"]`;
}

function edgeStatement(sourceId, targetId, label) {
  const escapedLabel = label === undefined ? undefined : escapeMermaidText(label);
  let statement;

  if (escapedLabel === undefined) {
    statement = `${sourceId} --> ${targetId}`;
  } else {
    statement = `${sourceId} -->|"${escapedLabel}"| ${targetId}`;
  }

  return statement;
}

function edgeStyle(changeType) {
  let style;

  if (changeType === "added") {
    style = "stroke:#15803d,stroke-width:2px";
  } else if (changeType === "modified") {
    style = "stroke:#b45309,stroke-width:2px";
  } else if (changeType === "deleted") {
    style = "stroke:#b91c1c,stroke-width:2px,stroke-dasharray:5 3";
  } else if (changeType === "unchanged") {
    style = "stroke:#64748b,stroke-width:1.5px";
  }

  return style;
}

function renderMermaid(architectureDiff) {
  const dataflows = architectureDiff.relationships.filter(
    (relationship) => relationship.type === "dataflow"
  );
  const nodeIds = new Map();
  const changedClasses = [];
  const contextClasses = [];

  for (let classIndex = 0; classIndex < architectureDiff.classes.length; classIndex += 1) {
    const classDiff = architectureDiff.classes[classIndex];
    nodeIds.set(classDiff.name, `class${classIndex + 1}`);

    if (classDiff.changeType === "unchanged") {
      contextClasses.push(classDiff);
    } else {
      changedClasses.push(classDiff);
    }
  }

  const changedClassNames = new Set(changedClasses.map((classDiff) => classDiff.name));
  const boundaryNodeIds = new Map();
  let boundaryCounter = 1;

  for (
    let relationshipIndex = 0;
    relationshipIndex < dataflows.length;
    relationshipIndex += 1
  ) {
    const relationship = dataflows[relationshipIndex];
    const sourceIsChanged = changedClassNames.has(relationship.from);
    const targetIsChanged = changedClassNames.has(relationship.to);

    if (sourceIsChanged !== targetIsChanged) {
      boundaryNodeIds.set(relationshipIndex, `boundary${boundaryCounter}`);
      boundaryCounter += 1;
    }
  }

  const lines = [
    '%%{init: {"flowchart": {"nodeSpacing": 30, "rankSpacing": 35}}}%%',
    "flowchart TB",
  ];

  for (const classDiff of contextClasses) {
    lines.push(`  ${classNode(classDiff, nodeIds.get(classDiff.name))}`);
  }

  if (changedClasses.length > 0) {
    lines.push('  subgraph changeScope["Change Scope"]');
    lines.push("    direction TB");

    for (const classDiff of changedClasses) {
      lines.push(`    ${classNode(classDiff, nodeIds.get(classDiff.name))}`);
    }

    for (const boundaryNodeId of boundaryNodeIds.values()) {
      lines.push(`    ${boundaryNodeId}((" "))`);
    }

    lines.push("  end");
  }

  const linkStyles = [];
  let linkIndex = 0;

  for (
    let relationshipIndex = 0;
    relationshipIndex < dataflows.length;
    relationshipIndex += 1
  ) {
    const relationship = dataflows[relationshipIndex];
    const sourceId = nodeIds.get(relationship.from);
    const targetId = nodeIds.get(relationship.to);
    const boundaryNodeId = boundaryNodeIds.get(relationshipIndex);

    if (boundaryNodeId === undefined) {
      lines.push(`  ${edgeStatement(sourceId, targetId, relationship.label)}`);
      linkStyles.push(`  linkStyle ${linkIndex} ${edgeStyle(relationship.changeType)}`);
      linkIndex += 1;
    } else if (changedClassNames.has(relationship.from)) {
      lines.push(`  ${edgeStatement(sourceId, boundaryNodeId)}`);
      linkStyles.push(`  linkStyle ${linkIndex} ${edgeStyle(relationship.changeType)}`);
      linkIndex += 1;
      lines.push(`  ${edgeStatement(boundaryNodeId, targetId, relationship.label)}`);
      linkStyles.push(`  linkStyle ${linkIndex} ${edgeStyle(relationship.changeType)}`);
      linkIndex += 1;
    } else {
      lines.push(`  ${edgeStatement(sourceId, boundaryNodeId, relationship.label)}`);
      linkStyles.push(`  linkStyle ${linkIndex} ${edgeStyle(relationship.changeType)}`);
      linkIndex += 1;
      lines.push(`  ${edgeStatement(boundaryNodeId, targetId)}`);
      linkStyles.push(`  linkStyle ${linkIndex} ${edgeStyle(relationship.changeType)}`);
      linkIndex += 1;
    }
  }

  lines.push("  classDef added fill:#dcfce7,stroke:#15803d,color:#14532d");
  lines.push("  classDef modified fill:#fef3c7,stroke:#b45309,color:#78350f");
  lines.push("  classDef deleted fill:#fee2e2,stroke:#b91c1c,color:#7f1d1d");
  lines.push("  classDef unchanged fill:#f1f5f9,stroke:#64748b,color:#334155");
  lines.push("  classDef boundary fill:#ffffff,stroke:#475569,stroke-width:2px");

  for (const classDiff of architectureDiff.classes) {
    lines.push(`  class ${nodeIds.get(classDiff.name)} ${classDiff.changeType}`);
  }

  if (boundaryNodeIds.size > 0) {
    lines.push(`  class ${[...boundaryNodeIds.values()].join(",")} boundary`);
  }

  if (changedClasses.length > 0) {
    lines.push("  style changeScope fill:#f8fafc,stroke:#334155,stroke-width:2px");
  }
  lines.push(...linkStyles);

  return lines.join("\n");
}

function renderMarkdown(architectureDiff) {
  return [
    "# Architecture Diff",
    "",
    `Stage: ${architectureDiff.stage}`,
    "",
    "```mermaid",
    renderMermaid(architectureDiff),
    "```",
    "",
    "## Legend",
    "",
    "- Green nodes are added classes.",
    "- Amber nodes are modified classes.",
    "- Red nodes are deleted classes.",
    "- Gray nodes are unchanged context classes.",
    "- `+`, `~`, `-`, and `=` mark added, modified, deleted, and unchanged methods.",
    "- Edges are data flows; composition relationships are omitted.",
    "- Red dashed edges are deleted data flows.",
    "- Small circles mark data flows crossing the change scope.",
    "",
  ].join("\n");
}

if (inputArguments.length < 1 || inputArguments.length > 2) {
  console.error(
    "Usage: node ai-coding-toolkit/hld-gen/scripts/architecture-diff-to-mermaid.mjs <architecture-diff.json> [output.md]"
  );
  process.exitCode = 1;
} else {
  const inputPath = path.resolve(process.cwd(), inputArguments[0]);
  const parsedInputPath = path.parse(inputPath);
  const outputPath =
    inputArguments[1] === undefined
      ? path.join(parsedInputPath.dir, `${parsedInputPath.name}.mermaid.md`)
      : path.resolve(process.cwd(), inputArguments[1]);

  if (inputPath === outputPath) {
    console.error("Output path must differ from the input path.");
    process.exitCode = 1;
  } else {
    const validationResult = spawnSync(process.execPath, [validatorPath, inputPath], {
      encoding: "utf8",
    });

    if (validationResult.status !== 0) {
      process.stderr.write(validationResult.stderr);
      process.exitCode = 1;
    } else {
      const architectureDiff = JSON.parse(await readFile(inputPath, "utf8"));
      await mkdir(path.dirname(outputPath), { recursive: true });
      await writeFile(outputPath, renderMarkdown(architectureDiff));
      console.log(`Created Mermaid diagram: ${outputPath}`);
    }
  }
}
