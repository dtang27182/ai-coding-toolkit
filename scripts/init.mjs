import { mkdir, readFile, realpath, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { installCodexSkills } from "../adapters/codex.mjs";
import { copyDirectory } from "./copy-directory.mjs";

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const toolkitDirectory = await realpath(path.resolve(scriptDirectory, ".."));
const inputArguments = process.argv.slice(2);
let repoDirectory;
let agentName = "codex";
let outputDirectory = "docs/plans";
let selectedTool;
let argumentError;

for (let argumentIndex = 0; argumentIndex < inputArguments.length; ) {
  if (
    inputArguments[argumentIndex] === "--agent" &&
    inputArguments[argumentIndex + 1] !== undefined
  ) {
    agentName = inputArguments[argumentIndex + 1];
    argumentIndex += 2;
  } else if (
    inputArguments[argumentIndex] === "--output-dir" &&
    inputArguments[argumentIndex + 1] !== undefined
  ) {
    outputDirectory = inputArguments[argumentIndex + 1];
    argumentIndex += 2;
  } else if (
    inputArguments[argumentIndex] === "--tool" &&
    inputArguments[argumentIndex + 1] !== undefined
  ) {
    selectedTool = inputArguments[argumentIndex + 1];
    argumentIndex += 2;
  } else if (
    !inputArguments[argumentIndex].startsWith("-") &&
    repoDirectory === undefined
  ) {
    repoDirectory = path.resolve(inputArguments[argumentIndex]);
    argumentIndex += 1;
  } else {
    argumentError = `Unknown or incomplete argument: ${inputArguments[argumentIndex]}`;
    argumentIndex += 1;
  }
}

const supportedTools = ["hld-gen", "hld-gen-new", "enrich-diff", "advanced-diff-viewer"];
const toolNames = selectedTool === undefined ? ["hld-gen"] : [selectedTool];
const relativeOutputDirectory = path.normalize(outputDirectory);
const outputIsRepoSubdirectory =
  relativeOutputDirectory !== "." &&
  relativeOutputDirectory !== ".." &&
  !relativeOutputDirectory.startsWith(`..${path.sep}`) &&
  !path.isAbsolute(relativeOutputDirectory);

async function installRootCommands() {
  const packagePath = path.join(repoDirectory, "package.json");
  let packageJson;

  try {
    packageJson = JSON.parse(await readFile(packagePath, "utf8"));
  } catch (error) {
    if (error.code !== "ENOENT") {
      throw error;
    }
  }

  if (packageJson !== undefined) {
    const commands = {};
    if (toolNames.includes("hld-gen-new")) {
      commands["hld-visualizer"] = "node ai-coding-toolkit/node_modules/vite/bin/vite.js ai-coding-toolkit/hld-gen-new/visualizer";
    }
    if (toolNames.includes("enrich-diff")) {
      commands["diff-visualizer"] = "node ai-coding-toolkit/node_modules/vite/bin/vite.js ai-coding-toolkit/enrich-diff/visualizer";
    }
    if (toolNames.includes("advanced-diff-viewer")) {
      commands["adv-diff"] = "node ai-coding-toolkit/node_modules/vite/bin/vite.js ai-coding-toolkit/advanced-diff-viewer/visualizer";
    }
    let packageChanged = false;
    if (
      toolNames.includes("enrich-diff") &&
      packageJson.scripts?.["diff-visualizer"] === "node ai-coding-toolkit/node_modules/vite/bin/vite.js ai-coding-toolkit/common/diff-viewer/visualizer"
    ) {
      packageJson.scripts["diff-visualizer"] = commands["diff-visualizer"];
      packageChanged = true;
      console.log("Updated npm command: npm run diff-visualizer");
    }
    if (
      toolNames.includes("hld-gen-new") &&
      (
        packageJson.scripts?.["hld-gen-new-visualizer"] === "node ai-coding-toolkit/node_modules/vite/bin/vite.js ai-coding-toolkit/hld-gen-new/visualizer" ||
        packageJson.scripts?.["hld-gen-new-visualizer"] === "node ai-coding-toolkit/node_modules/vite/bin/vite.js ai-coding-toolkit/common/arch-diff/visualizer" ||
        packageJson.scripts?.["hld-gen-new-visualizer"] === "node ai-coding-toolkit/node_modules/vite/bin/vite.js ai-coding-toolkit/common/impl-dataflow/visualizer"
      )
    ) {
      delete packageJson.scripts["hld-gen-new-visualizer"];
      packageChanged = true;
      console.log("Removed retired npm command: npm run hld-gen-new-visualizer");
    }
    if (
      toolNames.includes("hld-gen-new") &&
      packageJson.scripts?.["hld-visualizer"] === "node ai-coding-toolkit/node_modules/vite/bin/vite.js ai-coding-toolkit/common/impl-dataflow/visualizer"
    ) {
      packageJson.scripts["hld-visualizer"] = commands["hld-visualizer"];
      packageChanged = true;
      console.log("Updated npm command: npm run hld-visualizer");
    }
    if (toolNames.includes("hld-gen") && packageJson.scripts?.mermaid === "node ai-coding-toolkit/hld-gen/scripts/architecture-diff-to-mermaid.mjs") {
      delete packageJson.scripts.mermaid;
      packageChanged = true;
      console.log("Removed retired npm command: npm run mermaid");
    }
    if (
      packageJson.scripts?.visualizer === "node ai-coding-toolkit/node_modules/vite/bin/vite.js ai-coding-toolkit/hld-gen/visualizer"
    ) {
      delete packageJson.scripts.visualizer;
      packageChanged = true;
      console.log("Removed retired npm command: npm run visualizer");
    }
    if (
      packageJson.scripts?.["advanced-diff-viewer:generate"] === "node ai-coding-toolkit/advanced-diff-viewer/generate-diff-index.mjs"
    ) {
      delete packageJson.scripts["advanced-diff-viewer:generate"];
      packageChanged = true;
      console.log("Removed retired npm command: npm run advanced-diff-viewer:generate");
    }
    if (
      packageJson.scripts?.["system-dataflow-visualizer"] === "node ai-coding-toolkit/node_modules/vite/bin/vite.js ai-coding-toolkit/common/system-dataflow/visualizer"
    ) {
      delete packageJson.scripts["system-dataflow-visualizer"];
      packageChanged = true;
      console.log("Removed retired npm command: npm run system-dataflow-visualizer");
    }
    if (
      (toolNames.includes("enrich-diff") || toolNames.includes("advanced-diff-viewer")) &&
      packageJson.scripts?.["diff-viewer"] === "node ai-coding-toolkit/node_modules/vite/bin/vite.js ai-coding-toolkit/common/diff-viewer/viewer"
    ) {
      delete packageJson.scripts["diff-viewer"];
      packageChanged = true;
      console.log("Removed retired npm command: npm run diff-viewer");
    }
    if (
      toolNames.includes("advanced-diff-viewer") &&
      packageJson.scripts?.["advanced-diff-viewer"] === "node ai-coding-toolkit/node_modules/vite/bin/vite.js ai-coding-toolkit/advanced-diff-viewer/visualizer"
    ) {
      delete packageJson.scripts["advanced-diff-viewer"];
      packageChanged = true;
      console.log("Removed retired npm command: npm run advanced-diff-viewer");
    }
    for (const [name, command] of Object.entries(commands)) {
      const existingCommand = packageJson.scripts?.[name];
      if (existingCommand === undefined) {
        packageJson.scripts = packageJson.scripts ?? {};
        packageJson.scripts[name] = command;
        packageChanged = true;
        console.log(`Installed npm command: npm run ${name}`);
      } else if (existingCommand === command) {
        console.log(`npm command already installed: npm run ${name}`);
      } else {
        console.warn(`Skipped npm command because npm run ${name} already exists`);
      }
    }
    if (packageChanged) {
      await writeFile(packagePath, `${JSON.stringify(packageJson, null, 2)}\n`);
    }
  }
}

if (argumentError !== undefined || repoDirectory === undefined) {
  console.error(argumentError ?? "Target repository path is required.");
  console.error(
    "Usage: node scripts/init.mjs <target-repo> [--agent codex] [--tool <hld-gen|hld-gen-new|enrich-diff|advanced-diff-viewer>] [--output-dir <relative-directory>]"
  );
  process.exitCode = 1;
} else if (agentName !== "codex") {
  console.error(`Unsupported agent: ${agentName}`);
  process.exitCode = 1;
} else if (selectedTool !== undefined && !supportedTools.includes(selectedTool)) {
  console.error(`Unsupported tool: ${selectedTool}`);
  process.exitCode = 1;
} else if (!outputIsRepoSubdirectory) {
  console.error("Output directory must be a relative directory under the repository root.");
  process.exitCode = 1;
} else {
  if (!(await stat(repoDirectory)).isDirectory()) {
    throw new Error(`Target repository is not a directory: ${repoDirectory}`);
  }
  repoDirectory = await realpath(repoDirectory);
  const installedToolkitDirectory = path.join(repoDirectory, "ai-coding-toolkit");
  const outputPath = path.resolve(repoDirectory, relativeOutputDirectory);
  const installedDirectories = [
    ...toolNames,
    ...(toolNames.includes("hld-gen-new") || toolNames.includes("enrich-diff") || toolNames.includes("advanced-diff-viewer") ? ["common"] : []),
    "node_modules",
  ];
  for (const directoryName of installedDirectories) {
    let relativePaths;
    if (directoryName === "common" && toolNames.includes("advanced-diff-viewer")) {
      relativePaths = ["enriched-patch-viewer", "default-output-file-plugin.mjs"];
    } else if (directoryName === "advanced-diff-viewer") {
      relativePaths = [
        "generate-enriched-patch.mjs",
        "visualizer/index.html",
        "visualizer/src",
        "visualizer/tsconfig.json",
        "visualizer/vite.config.mjs",
        "visualizer/vite-plugin.mjs",
      ];
    }
    await copyDirectory(
      path.join(toolkitDirectory, directoryName),
      path.join(installedToolkitDirectory, directoryName),
      relativePaths
    );
  }
  if (toolNames.includes("hld-gen")) {
    for (const relativePath of ["hld-architecture.md", "skills/hld-eval", "skills/hld-gen/SKILL.next.md", "references/hld-evaluation-format.md", "scripts/architecture-diff-to-mermaid.mjs"]) {
      await rm(path.join(installedToolkitDirectory, "hld-gen", relativePath), { recursive: true, force: true });
    }
  }
  if (toolNames.includes("hld-gen-new")) {
    await rm(path.join(installedToolkitDirectory, "common", "arch-diff"), { recursive: true, force: true });
    await rm(path.join(installedToolkitDirectory, "hld-gen-new", "visualizer", "dist"), { recursive: true, force: true });
  }
  if (toolNames.includes("enrich-diff")) {
    await rm(path.join(installedToolkitDirectory, "common", "enriched-patch-viewer", "visualizer"), { recursive: true, force: true });
  }
  if (toolNames.includes("enrich-diff") || toolNames.includes("advanced-diff-viewer")) {
    for (const relativePath of ["index.html", "src/main.ts", "tsconfig.json", "vite.config.mjs", "dist"]) {
      await rm(path.join(installedToolkitDirectory, "common", "enriched-patch-viewer", "viewer", relativePath), { recursive: true, force: true });
    }
  }
  await installCodexSkills(repoDirectory, toolkitDirectory, toolNames.filter((name) => name !== "advanced-diff-viewer"));
  await installRootCommands();
  if (!toolNames.includes("advanced-diff-viewer")) {
    await mkdir(outputPath, { recursive: true });
    await writeFile(
      path.join(installedToolkitDirectory, "config.json"),
      `${JSON.stringify({ outputDirectory: relativeOutputDirectory }, null, 2)}\n`
    );
    console.log(`Configured design output: ${outputPath}`);
  }
}
