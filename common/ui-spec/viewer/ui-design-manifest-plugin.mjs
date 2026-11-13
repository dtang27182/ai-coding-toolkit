import { readFile, readdir, stat } from "node:fs/promises";
import path from "node:path";

import { defaultOutputFilePlugin } from "../../default-output-file-plugin.mjs";
import { parseSpec } from "../parser/parser.ts";

async function newestManifest(directory) {
  let entries;
  try {
    entries = await readdir(directory, { withFileTypes: true });
  } catch (error) {
    if (error.code === "ENOENT") return undefined;
    throw error;
  }

  let newest;
  for (const entry of entries.sort((left, right) => left.name.localeCompare(right.name))) {
    const entryPath = path.join(directory, entry.name);
    let candidate;
    if (entry.isDirectory()) {
      candidate = await newestManifest(entryPath);
    } else if (entry.name === "ui-design-manifest.json") {
      candidate = { path: entryPath, modifiedTime: (await stat(entryPath)).mtimeMs };
    }
    if (candidate !== undefined && (newest === undefined || candidate.modifiedTime > newest.modifiedTime)) newest = candidate;
  }
  return newest;
}

export async function findDefaultUiDesignManifest(repositoryDirectory, toolkitDirectory) {
  const config = JSON.parse(await readFile(path.join(toolkitDirectory, "config.json"), "utf8"));
  return (await newestManifest(path.resolve(repositoryDirectory, config.outputDirectory)))?.path;
}

function referencePlugin(repositoryDirectory) {
  const install = (server) => {
    server.middlewares.use(async (request, response, next) => {
      const url = new URL(request.url ?? "", "http://localhost");
      if (request.method === "GET" && url.pathname === "/__ui-spec/reference") {
        const reference = url.searchParams.get("path");
        if (reference === null || !path.isAbsolute(reference) ||
          !(reference.endsWith(".ui.dsl") || reference.endsWith(".ui.json"))) {
          response.statusCode = 400;
          response.end("Invalid UI design reference");
        } else {
          try {
            const source = await readFile(reference, "utf8");
            const contents = reference.endsWith(".ui.dsl") ? JSON.stringify(parseSpec(source)) : source;
            response.setHeader("Content-Type", "application/json");
            response.end(JSON.stringify({ fileName: path.relative(repositoryDirectory, reference), contents }));
          } catch (error) {
            response.statusCode = error.code === "ENOENT" ? 404 : error instanceof SyntaxError ? 422 : 500;
            response.end(error instanceof Error ? error.message : String(error));
          }
        }
      } else {
        next();
      }
    });
  };
  return { name: "ui-design-references", configureServer: install, configurePreviewServer: install };
}

export function uiDesignManifestPlugin(repositoryDirectory, toolkitDirectory) {
  return [
    defaultOutputFilePlugin("default-ui-design-manifest", "/__ui-spec/default-manifest", findDefaultUiDesignManifest, repositoryDirectory, toolkitDirectory),
    referencePlugin(repositoryDirectory),
  ];
}
