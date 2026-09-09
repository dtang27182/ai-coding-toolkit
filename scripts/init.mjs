import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { installCodexSkills } from "../adapters/codex.mjs";

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const toolkitDirectory = path.resolve(scriptDirectory, "..");
const repoDirectory = path.resolve(toolkitDirectory, "..");
const inputArguments = process.argv.slice(2);
let agentName = "codex";
let outputDirectory = "docs/plans";
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
  } else {
    argumentError = `Unknown or incomplete argument: ${inputArguments[argumentIndex]}`;
    argumentIndex += 1;
  }
}

const outputPath = path.resolve(repoDirectory, outputDirectory);
const relativeOutputDirectory = path.relative(repoDirectory, outputPath);
const outputIsRepoSubdirectory =
  relativeOutputDirectory !== "" &&
  relativeOutputDirectory !== ".." &&
  !relativeOutputDirectory.startsWith(`..${path.sep}`) &&
  !path.isAbsolute(relativeOutputDirectory);

async function installRootMermaidCommand() {
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
    const mermaidCommand = "node ai-coding-toolkit/scripts/change-structure-to-mermaid.mjs";
    const existingCommand = packageJson.scripts?.mermaid;

    if (existingCommand === undefined) {
      packageJson.scripts = packageJson.scripts ?? {};
      packageJson.scripts.mermaid = mermaidCommand;
      await writeFile(packagePath, `${JSON.stringify(packageJson, null, 2)}\n`);
      console.log(`Installed npm command: npm run mermaid`);
    } else if (existingCommand === mermaidCommand) {
      console.log(`npm command already installed: npm run mermaid`);
    } else {
      throw new Error("Refusing to replace existing npm script: mermaid");
    }
  }
}

if (argumentError !== undefined) {
  console.error(argumentError);
  console.error(
    "Usage: node ai-coding-toolkit/scripts/init.mjs [--agent codex] [--output-dir <relative-directory>]"
  );
  process.exitCode = 1;
} else if (agentName !== "codex") {
  console.error(`Unsupported agent: ${agentName}`);
  process.exitCode = 1;
} else if (!outputIsRepoSubdirectory) {
  console.error("Output directory must be a relative directory under the repository root.");
  process.exitCode = 1;
} else {
  await installCodexSkills(repoDirectory, toolkitDirectory);
  await installRootMermaidCommand();
  await mkdir(outputPath, { recursive: true });
  await writeFile(
    path.join(toolkitDirectory, "config.json"),
    `${JSON.stringify({ outputDirectory: relativeOutputDirectory }, null, 2)}\n`
  );
  console.log(`Configured change-structure output: ${outputPath}`);
}
