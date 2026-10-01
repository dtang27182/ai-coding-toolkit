import { readFile, readdir, stat } from "node:fs/promises";
import path from "node:path";

import { defaultOutputFilePlugin } from "../../common/default-output-file-plugin.mjs";

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
    } else if (entry.name.endsWith(".hld-manifest.json")) {
      candidate = { path: entryPath, modifiedTime: (await stat(entryPath)).mtimeMs };
    }
    if (candidate !== undefined && (newest === undefined || candidate.modifiedTime > newest.modifiedTime)) newest = candidate;
  }
  return newest;
}

export async function findDefaultHldManifest(repositoryDirectory, toolkitDirectory) {
  const config = JSON.parse(await readFile(path.join(toolkitDirectory, "config.json"), "utf8"));
  return (await newestManifest(path.resolve(repositoryDirectory, config.outputDirectory)))?.path;
}

export function hldManifestPlugin(repositoryDirectory, toolkitDirectory) {
  return [
    defaultOutputFilePlugin("default-hld-manifest", "/__hld-manifest/default", findDefaultHldManifest, repositoryDirectory, toolkitDirectory),
    {
      name: "hld-manifest-references",
      configureServer(server) {
        server.middlewares.use(async (request, response, next) => {
          const url = new URL(request.url ?? "", "http://localhost");
          if (request.method === "GET" && url.pathname === "/__hld-manifest/reference") {
            const reference = url.searchParams.get("path");
            if (reference === null || !path.isAbsolute(reference) ||
              !(reference.endsWith(".hld.md") || reference.endsWith(".sys-dataflow.json") || reference.endsWith(".impl-dataflow.json"))) {
              response.statusCode = 400;
              response.end("Invalid HLD manifest reference");
            } else {
              try {
                response.setHeader("Content-Type", "application/json");
                response.end(JSON.stringify({ fileName: path.relative(repositoryDirectory, reference), contents: await readFile(reference, "utf8") }));
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
    },
  ];
}
