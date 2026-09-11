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

function classNodes(classDiff, nodeIds, methodNodeIds) {
  const lines = [`${nodeIds.get(classDiff.name)}["${escapeMermaidText(classDiff.name)}"]`];

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

    lines.push(`${methodNodeIds.get(classDiff.name).get(method.name)}["${changeMarker} ${escapeMermaidText(classDiff.name)}.${escapeMermaidText(method.name)}"]`);
  }

  return lines;
}

function endpointNodeId(endpoint, nodeIds, methodNodeIds) {
  let nodeId;

  if (endpoint.method !== undefined) {
    nodeId = methodNodeIds.get(endpoint.class).get(endpoint.method);
  } else if (endpoint.component !== undefined) {
    nodeId = nodeIds.get(endpoint.component);
  } else if (endpoint.class !== undefined) {
    nodeId = nodeIds.get(endpoint.class);
  }

  return nodeId;
}

function edgeStatement(sourceId, targetId, type, label) {
  const escapedLabel = label === undefined ? undefined : escapeMermaidText(label);
  let arrow;
  if (type === "dataflow") {
    arrow = "-->";
  } else if (type === "state-update") {
    arrow = "-.->";
  }
  let statement;

  if (escapedLabel === undefined) {
    statement = `${sourceId} ${arrow} ${targetId}`;
  } else {
    statement = `${sourceId} ${arrow}|"${escapedLabel}"| ${targetId}`;
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
  const visibleRelationships = architectureDiff.relationships.filter(
    (relationship) => relationship.type === "dataflow" || relationship.type === "state-update"
  );
  const nodeIds = new Map();
  const methodNodeIds = new Map();
  let methodCounter = 1;
  const changedClasses = [];
  const contextClasses = [];

  for (let classIndex = 0; classIndex < architectureDiff.classes.length; classIndex += 1) {
    const classDiff = architectureDiff.classes[classIndex];
    nodeIds.set(classDiff.name, `class${classIndex + 1}`);
    methodNodeIds.set(classDiff.name, new Map());
    for (const method of classDiff.methods) {
      methodNodeIds.get(classDiff.name).set(method.name, `method${methodCounter}`);
      methodCounter += 1;
    }

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
    relationshipIndex < visibleRelationships.length;
    relationshipIndex += 1
  ) {
    const relationship = visibleRelationships[relationshipIndex];
    const sourceIsChanged = changedClassNames.has(relationship.from.class);
    const targetIsChanged = changedClassNames.has(relationship.to.class);

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
    lines.push(...classNodes(classDiff, nodeIds, methodNodeIds).map((line) => `  ${line}`));
  }

  let componentCounter = 1;
  for (const component of architectureDiff.components) {
    const nodeId = `component${componentCounter}`;
    componentCounter += 1;
    nodeIds.set(component.name, nodeId);

    if (component.type === "ui") {
      lines.push(`  ${nodeId}("UI: ${escapeMermaidText(component.name)}")`);
    } else if (component.type === "external-io") {
      lines.push(`  ${nodeId}{{"I/O: ${escapeMermaidText(component.name)}"}}`);
    }
  }

  if (changedClasses.length > 0) {
    lines.push('  subgraph changeScope["Change Scope"]');
    lines.push("    direction TB");

    for (const classDiff of changedClasses) {
      lines.push(...classNodes(classDiff, nodeIds, methodNodeIds).map((line) => `    ${line}`));
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
    relationshipIndex < visibleRelationships.length;
    relationshipIndex += 1
  ) {
    const relationship = visibleRelationships[relationshipIndex];
    const sourceId = endpointNodeId(relationship.from, nodeIds, methodNodeIds);
    const targetId = endpointNodeId(relationship.to, nodeIds, methodNodeIds);
    const boundaryNodeId = boundaryNodeIds.get(relationshipIndex);
    let label = relationship.label;
    if (relationship.type === "state-update") {
      label = `state update: ${relationship.label}`;
    }

    if (boundaryNodeId === undefined) {
      lines.push(`  ${edgeStatement(sourceId, targetId, relationship.type, label)}`);
      linkStyles.push(`  linkStyle ${linkIndex} ${edgeStyle(relationship.changeType)}`);
      linkIndex += 1;
    } else if (changedClassNames.has(relationship.from.class)) {
      lines.push(`  ${edgeStatement(sourceId, boundaryNodeId, relationship.type)}`);
      linkStyles.push(`  linkStyle ${linkIndex} ${edgeStyle(relationship.changeType)}`);
      linkIndex += 1;
      lines.push(`  ${edgeStatement(boundaryNodeId, targetId, relationship.type, label)}`);
      linkStyles.push(`  linkStyle ${linkIndex} ${edgeStyle(relationship.changeType)}`);
      linkIndex += 1;
    } else {
      lines.push(`  ${edgeStatement(sourceId, boundaryNodeId, relationship.type, label)}`);
      linkStyles.push(`  linkStyle ${linkIndex} ${edgeStyle(relationship.changeType)}`);
      linkIndex += 1;
      lines.push(`  ${edgeStatement(boundaryNodeId, targetId, relationship.type)}`);
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
    for (const method of classDiff.methods) {
      lines.push(`  class ${methodNodeIds.get(classDiff.name).get(method.name)} ${method.changeType}`);
    }
  }

  for (const component of architectureDiff.components) {
    lines.push(`  class ${nodeIds.get(component.name)} ${component.changeType}`);
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
    "- Green nodes are added classes, methods, or components.",
    "- Amber nodes are modified classes, methods, or components.",
    "- Red nodes are deleted classes, methods, or components.",
    "- Gray nodes are unchanged classes, methods, or components.",
    "- Rounded nodes marked UI are user-facing components; hexagons marked I/O are external I/O endpoints.",
    "- UI and external I/O components sit outside the class change scope.",
    "- `+`, `~`, `-`, and `=` mark added, modified, deleted, and unchanged methods.",
    "- Method nodes show their owning class and method name.",
    "- Data flows connect methods and UI or external I/O components; composition relationships are omitted.",
    "- Dotted edges labeled state update connect a method to the class whose instance variable it updates.",
    "- Red dashed edges are deleted data flows.",
    "- Small circles mark data flows and state updates crossing the class change scope.",
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
