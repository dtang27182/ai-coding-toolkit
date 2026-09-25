import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { defineConfig } from "vite";

import { findNewestImplementationDataflow } from "./default-impl-dataflow.mjs";

const visualizerDirectory = path.dirname(fileURLToPath(import.meta.url));
const toolkitDirectory = path.resolve(visualizerDirectory, "../../..");
const repositoryDirectory = process.cwd();

export default defineConfig({
  plugins: [{
    name: "default-impl-dataflow",
    configureServer(server) {
      server.middlewares.use(async (request, response, next) => {
        if (request.method === "GET" && request.url === "/__impl-dataflow/default") {
          try {
            const filePath = await findNewestImplementationDataflow(repositoryDirectory, toolkitDirectory);
            if (filePath === undefined) {
              response.statusCode = 204;
              response.end();
            } else {
              response.setHeader("Content-Type", "application/json");
              response.end(JSON.stringify({
                fileName: path.relative(repositoryDirectory, filePath),
                contents: await readFile(filePath, "utf8"),
              }));
            }
          } catch (error) {
            response.statusCode = 500;
            response.end(error instanceof Error ? error.message : String(error));
          }
        } else {
          next();
        }
      });
    },
  }],
});
