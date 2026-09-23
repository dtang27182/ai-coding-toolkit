import { readFile } from "node:fs/promises";
import path from "node:path";

export function defaultOutputFilePlugin(name, endpoint, findFile, repositoryDirectory, toolkitDirectory) {
  return {
    name,
    configureServer(server) {
      server.middlewares.use(async (request, response, next) => {
        if (request.method === "GET" && request.url === endpoint) {
          try {
            const filePath = await findFile(repositoryDirectory, toolkitDirectory);
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
  };
}
