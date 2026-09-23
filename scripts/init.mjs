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

const supportedTools = ["hld-gen", "hld-gen-new", "annotate-diff"];
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
    if (toolNames.includes("hld-gen")) {
      commands.visualizer = "node ai-coding-toolkit/node_modules/vite/bin/vite.js ai-coding-toolkit/hld-gen/visualizer";
    }
    if (toolNames.includes("hld-gen-new")) {
      commands["hld-gen-new-visualizer"] = "node ai-coding-toolkit/node_modules/vite/bin/vite.js ai-coding-toolkit/hld-gen-new/visualizer";
    }
    if (toolNames.includes("annotate-diff")) {
      commands["diff-visualizer"] = "node ai-coding-toolkit/node_modules/vite/bin/vite.js ai-coding-toolkit/annotate-diff/visualizer";
      commands["system-dataflow-visualizer"] = "node ai-coding-toolkit/node_modules/vite/bin/vite.js ai-coding-toolkit/common/system-dataflow/visualizer";
      commands["diff-viewer"] = "node ai-coding-toolkit/node_modules/vite/bin/vite.js ai-coding-toolkit/common/diff-viewer/viewer";
    }
    let packageChanged = false;
    if (
      toolNames.includes("annotate-diff") &&
      packageJson.scripts?.["diff-visualizer"] === "node ai-coding-toolkit/node_modules/vite/bin/vite.js ai-coding-toolkit/common/diff-viewer/visualizer"
    ) {
      packageJson.scripts["diff-visualizer"] = commands["diff-visualizer"];
      packageChanged = true;
      console.log("Updated npm command: npm run diff-visualizer");
    }
    if (toolNames.includes("hld-gen") && packageJson.scripts?.mermaid === "node ai-coding-toolkit/hld-gen/scripts/architecture-diff-to-mermaid.mjs") {
      delete packageJson.scripts.mermaid;
      packageChanged = true;
      console.log("Removed retired npm command: npm run mermaid");
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
    "Usage: node scripts/init.mjs <target-repo> [--agent codex] [--tool <hld-gen|hld-gen-new|annotate-diff>] [--output-dir <relative-directory>]"
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
  const installedDirectories = [...toolNames, ...(toolNames.includes("annotate-diff") ? ["common"] : []), "node_modules"];
  for (const directoryName of installedDirectories) {
    await copyDirectory(
      path.join(toolkitDirectory, directoryName),
      path.join(installedToolkitDirectory, directoryName)
    );
  }
  if (toolNames.includes("hld-gen")) {
    for (const relativePath of ["hld-architecture.md", "skills/hld-eval", "skills/hld-gen/SKILL.next.md", "references/hld-evaluation-format.md", "scripts/architecture-diff-to-mermaid.mjs"]) {
      await rm(path.join(installedToolkitDirectory, "hld-gen", relativePath), { recursive: true, force: true });
    }
  }
  if (toolNames.includes("annotate-diff")) {
    await rm(path.join(installedToolkitDirectory, "common", "diff-viewer", "visualizer"), { recursive: true, force: true });
  }
  await installCodexSkills(repoDirectory, toolkitDirectory, toolNames);
  await installRootCommands();
  await mkdir(outputPath, { recursive: true });
  await writeFile(
    path.join(installedToolkitDirectory, "config.json"),
    `${JSON.stringify({ outputDirectory: relativeOutputDirectory }, null, 2)}\n`
  );
  console.log(`Configured design output: ${outputPath}`);
}
