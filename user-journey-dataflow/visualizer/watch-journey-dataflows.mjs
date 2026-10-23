import { readFile } from "node:fs/promises";
import path from "node:path";

export function watchJourneyDataflows(repositoryDirectory, toolkitDirectory) {
  return {
    name: "watch-journey-dataflows",
    async configureServer(server) {
      const config = JSON.parse(await readFile(path.join(toolkitDirectory, "config.json"), "utf8"));
      const directory = path.resolve(repositoryDirectory, config.outputDirectory, "user-journey-dataflow");
      server.watcher.add(directory);
      for (const event of ["add", "change"]) {
        server.watcher.on(event, async (filePath) => {
          if (path.dirname(filePath) === directory && filePath.endsWith(".sys-dataflow.json")) {
            if (event === "add") {
              server.ws.send({ type: "full-reload" });
            } else if (event === "change") {
              server.ws.send("hld-dataflow:file-change", {
                fileName: path.relative(repositoryDirectory, filePath),
                contents: await readFile(filePath, "utf8"),
              });
            }
          }
        });
      }
    },
  };
}
