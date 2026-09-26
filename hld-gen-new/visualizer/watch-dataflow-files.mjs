import { readFile } from "node:fs/promises";
import path from "node:path";

export function watchDataflowFiles(repositoryDirectory, toolkitDirectory) {
  return {
    name: "watch-hld-dataflow-files",
    async configureServer(server) {
      const config = JSON.parse(await readFile(path.join(toolkitDirectory, "config.json"), "utf8"));
      const outputDirectory = path.resolve(repositoryDirectory, config.outputDirectory);
      server.watcher.add(outputDirectory);
      async function sendChange(filePath) {
        const relativePath = path.relative(outputDirectory, filePath);
        if (
          relativePath !== ".." &&
          !relativePath.startsWith(`..${path.sep}`) &&
          !path.isAbsolute(relativePath) &&
          (/\.impl-dataflow\.json$/.test(filePath) || /\.system-dataflow(?:\.code-review)?\.json$/.test(filePath))
        ) {
          try {
            server.ws.send("hld-dataflow:file-change", {
              fileName: path.relative(repositoryDirectory, filePath),
              contents: await readFile(filePath, "utf8"),
            });
          } catch (error) {
            if (error.code !== "ENOENT") throw error;
          }
        }
      }
      for (const event of ["add", "change"]) {
        server.watcher.on(event, (filePath) => sendChange(filePath).catch((error) => server.config.logger.error(String(error))));
      }
    },
  };
}
