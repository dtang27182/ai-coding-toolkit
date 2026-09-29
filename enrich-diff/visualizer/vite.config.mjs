import { readFile, readdir, stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { defineConfig } from "vite";

import { defaultOutputFilePlugin } from "../../common/default-output-file-plugin.mjs";

const visualizerDirectory = path.dirname(fileURLToPath(import.meta.url));
const toolkitDirectory = path.resolve(visualizerDirectory, "../..");
const repositoryDirectory = process.cwd();

async function newestRichDiff(directory) {
  let entries;
  try {
    entries = await readdir(directory, { withFileTypes: true });
  } catch (error) {
    if (error.code === "ENOENT") {
      return undefined;
    } else {
      throw error;
    }
  }

  let newest;
  for (const entry of entries.sort((left, right) => left.name.localeCompare(right.name))) {
    const entryPath = path.join(directory, entry.name);
    let candidate;
    if (entry.isDirectory()) {
      candidate = await newestRichDiff(entryPath);
    } else if (entry.name.endsWith(".rich-diff.json")) {
      candidate = { path: entryPath, modifiedTime: (await stat(entryPath)).mtimeMs };
    }
    if (candidate !== undefined && (newest === undefined || candidate.modifiedTime > newest.modifiedTime)) {
      newest = candidate;
    }
  }
  return newest;
}

async function findDefaultRichDiff(repository, toolkit) {
  const config = JSON.parse(await readFile(path.join(toolkit, "config.json"), "utf8"));
  return (await newestRichDiff(path.resolve(repository, config.outputDirectory)))?.path;
}

function richDiffReferencesPlugin() {
  return {
    name: "rich-diff-references",
    configureServer(server) {
      server.middlewares.use(async (request, response, next) => {
        const url = new URL(request.url ?? "", "http://localhost");
        if (request.method === "GET" && url.pathname === "/__rich-diff/reference") {
          const reference = url.searchParams.get("path");
          if (
            reference === null ||
            !path.isAbsolute(reference) ||
            !(reference.endsWith(".enriched-patch.json") || reference.endsWith(".sys-dataflow.json") || reference.endsWith(".impl-dataflow.json"))
          ) {
            response.statusCode = 400;
            response.end("Invalid rich-diff reference");
          } else {
            try {
              response.setHeader("Content-Type", "application/json");
              response.end(await readFile(reference, "utf8"));
            } catch (error) {
              response.statusCode = error.code === "ENOENT" ? 404 : 500;
              response.end(error instanceof Error ? error.message : String(error));
            }
          }
        } else {
          next();
        }
      });
    },
  };
}

export default defineConfig({
  base: "./",
  plugins: [
    defaultOutputFilePlugin(
      "default-rich-diff",
      "/__rich-diff/default",
      findDefaultRichDiff,
      repositoryDirectory,
      toolkitDirectory,
    ),
    richDiffReferencesPlugin(),
  ],
  build: {
    rollupOptions: {
      input: {
        index: path.join(visualizerDirectory, "index.html"),
        implementation: path.join(visualizerDirectory, "implementation.html"),
      },
    },
  },
});
