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
    }

    const coreMarker = method.coreChange === true ? " ★" : "";
    labelLines.push(`${changeMarker} ${escapeMermaidText(method.name)}${coreMarker}`);
  }

  return labelLines.join("<br/>");
}

function classNode(classDiff, nodeId) {
  const label = classLabel(classDiff);

  if (classDiff.coreChange === true) {
    return `${nodeId}(("${label}"))`;
  } else {
    return `${nodeId}["${label}"]`;
  }
}

function edgeStatement(sourceId, targetId, relationship, label) {
  const escapedLabel = label === undefined ? undefined : escapeMermaidText(label);
  let statement;

  if (relationship.type === "dataflow" && escapedLabel === undefined) {
    statement = `${sourceId} --> ${targetId}`;
  } else if (relationship.type === "dataflow") {
    statement = `${sourceId} -->|"${escapedLabel}"| ${targetId}`;
  } else if (relationship.type === "composition" && escapedLabel === undefined) {
    statement = `${sourceId} -.-> ${targetId}`;
  } else if (relationship.type === "composition") {
    statement = `${sourceId} -. "${escapedLabel}" .-> ${targetId}`;
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
    relationshipIndex < architectureDiff.relationships.length;
    relationshipIndex += 1
  ) {
    const relationship = architectureDiff.relationships[relationshipIndex];
    const sourceIsChanged = changedClassNames.has(relationship.from);
    const targetIsChanged = changedClassNames.has(relationship.to);

    if (relationship.type === "dataflow" && sourceIsChanged !== targetIsChanged) {
      boundaryNodeIds.set(relationshipIndex, `boundary${boundaryCounter}`);
      boundaryCounter += 1;
    }
  }

  const lines = ["flowchart LR"];

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
    relationshipIndex < architectureDiff.relationships.length;
    relationshipIndex += 1
  ) {
    const relationship = architectureDiff.relationships[relationshipIndex];
    const sourceId = nodeIds.get(relationship.from);
    const targetId = nodeIds.get(relationship.to);
    const boundaryNodeId = boundaryNodeIds.get(relationshipIndex);
    const relationshipLabel =
      relationship.label ?? (relationship.type === "composition" ? "composition" : undefined);

    if (boundaryNodeId === undefined) {
      lines.push(`  ${edgeStatement(sourceId, targetId, relationship, relationshipLabel)}`);
      linkStyles.push(`  linkStyle ${linkIndex} ${edgeStyle(relationship.changeType)}`);
      linkIndex += 1;
    } else if (changedClassNames.has(relationship.from)) {
      lines.push(`  ${edgeStatement(sourceId, boundaryNodeId, relationship)}`);
      linkStyles.push(`  linkStyle ${linkIndex} ${edgeStyle(relationship.changeType)}`);
      linkIndex += 1;
      lines.push(`  ${edgeStatement(boundaryNodeId, targetId, relationship, relationshipLabel)}`);
      linkStyles.push(`  linkStyle ${linkIndex} ${edgeStyle(relationship.changeType)}`);
      linkIndex += 1;
    } else {
      lines.push(`  ${edgeStatement(sourceId, boundaryNodeId, relationship, relationshipLabel)}`);
      linkStyles.push(`  linkStyle ${linkIndex} ${edgeStyle(relationship.changeType)}`);
      linkIndex += 1;
      lines.push(`  ${edgeStatement(boundaryNodeId, targetId, relationship)}`);
      linkStyles.push(`  linkStyle ${linkIndex} ${edgeStyle(relationship.changeType)}`);
      linkIndex += 1;
    }
  }

  lines.push("  classDef added fill:#dcfce7,stroke:#15803d,color:#14532d");
  lines.push("  classDef modified fill:#fef3c7,stroke:#b45309,color:#78350f");
  lines.push("  classDef deleted fill:#fee2e2,stroke:#b91c1c,color:#7f1d1d");
  lines.push("  classDef unchanged fill:#f1f5f9,stroke:#64748b,color:#334155");
  lines.push("  classDef addedCore fill:#dcfce7,stroke:#7e22ce,stroke-width:4px,color:#14532d");
  lines.push("  classDef modifiedCore fill:#fef3c7,stroke:#7e22ce,stroke-width:4px,color:#78350f");
  lines.push("  classDef deletedCore fill:#fee2e2,stroke:#7e22ce,stroke-width:4px,color:#7f1d1d");
  lines.push("  classDef unchangedCore fill:#f1f5f9,stroke:#7e22ce,stroke-width:4px,color:#334155");
  lines.push("  classDef boundary fill:#ffffff,stroke:#475569,stroke-width:2px");

  for (const classDiff of architectureDiff.classes) {
    const styleName =
      classDiff.coreChange === true ? `${classDiff.changeType}Core` : classDiff.changeType;
    lines.push(`  class ${nodeIds.get(classDiff.name)} ${styleName}`);
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
    "- Circular purple-bordered nodes contain core feature logic.",
    "- `+`, `~`, and `-` mark added, modified, and deleted public methods; `★` marks core methods.",
    "- Solid edges are data flows; dashed edges are composition relationships.",
    "- Red dashed edges are deleted relationships.",
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
