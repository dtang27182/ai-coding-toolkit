import { execFileSync, spawnSync } from "node:child_process";
import { watch } from "node:fs";
import { readFile, stat } from "node:fs/promises";
import path from "node:path";

import { generateAdvancedEnrichedPatch } from "../generate-enriched-patch.mjs";

function git(repositoryDirectory, argumentsList) {
  return execFileSync("git", argumentsList, { cwd: repositoryDirectory, encoding: "utf8" }).trim();
}

async function watchTarget(file) {
  let directory = path.dirname(file);
  let name = path.basename(file);
  while (true) {
    try {
      await stat(directory);
      return { directory, name };
    } catch (error) {
      if (error.code === "ENOENT") {
        name = path.basename(directory);
        directory = path.dirname(directory);
      } else {
        throw error;
      }
    }
  }
}

export function advancedDiffViewerPlugin(repositoryDirectory, watchGit = watch) {
  let server;
  let status;
  let lastReady;
  let generation;
  let requested = false;
  let timer;
  let version = 0;
  let gitWatchers = [];
  let watchVersion = 0;
  let closed = false;

  function notify() {
    if (!closed) server.ws.send("advanced-diff:update", { version: status.version });
  }

  function regenerate() {
    requested = true;
    if (generation === undefined) {
      generation = (async () => {
        while (requested) {
          requested = false;
          try {
            const outputFile = await generateAdvancedEnrichedPatch(repositoryDirectory);
            if (outputFile === undefined) {
              lastReady = undefined;
              status = { state: "empty", version: ++version };
            } else {
              lastReady = {
                fileName: path.relative(repositoryDirectory, outputFile),
                contents: await readFile(outputFile, "utf8"),
              };
              status = { state: "ready", version: ++version, ...lastReady };
            }
          } catch (error) {
            status = {
              state: "error",
              version: ++version,
              message: error instanceof Error ? error.message : String(error),
              ...lastReady,
            };
          }
        }
        generation = undefined;
        if (timer === undefined) notify();
        return status;
      })();
    }
    return generation;
  }

  function scheduleRegeneration() {
    if (timer === undefined && !closed) server.ws.send("advanced-diff:refreshing");
    clearTimeout(timer);
    timer = setTimeout(() => {
      timer = undefined;
      void regenerate();
    }, 300);
  }

  function onRepositoryChange(file) {
    const relativePath = path.relative(repositoryDirectory, path.resolve(file));
    if (relativePath === "advanced-diff-viewer/enriched-patch.json") {
      return;
    } else if (relativePath === "ai-coding-toolkit" || relativePath.startsWith(`ai-coding-toolkit${path.sep}`)) {
      return;
    } else if (relativePath.startsWith("..") || path.isAbsolute(relativePath)) {
      return;
    }
    const ignored = spawnSync("git", ["check-ignore", "--quiet", "--", relativePath], { cwd: repositoryDirectory });
    if (ignored.status !== 0) scheduleRegeneration();
  }

  async function bindGitWatchers() {
    const currentWatchVersion = ++watchVersion;
    const files = [
      path.resolve(repositoryDirectory, git(repositoryDirectory, ["rev-parse", "--git-path", "HEAD"])),
      path.resolve(repositoryDirectory, git(repositoryDirectory, ["rev-parse", "--git-path", "packed-refs"])),
    ];
    const branch = spawnSync("git", ["symbolic-ref", "--quiet", "HEAD"], {
      cwd: repositoryDirectory,
      encoding: "utf8",
    });
    if (branch.status === 0) {
      files.push(path.resolve(repositoryDirectory, git(repositoryDirectory, ["rev-parse", "--git-path", branch.stdout.trim()])));
    }

    const directories = new Map();
    for (const file of files) {
      const { directory, name } = await watchTarget(file);
      const names = directories.get(directory) ?? new Set();
      names.add(name);
      directories.set(directory, names);
    }
    if (currentWatchVersion !== watchVersion || closed) return;

    for (const watcher of gitWatchers) watcher.close();
    gitWatchers = [...directories].map(([directory, names]) => {
      const watcher = watchGit(directory, (_event, name) => {
        if (name === null || names.has(String(name))) {
          scheduleRegeneration();
          void bindGitWatchers().catch((error) => server.config.logger.error(String(error)));
        }
      });
      watcher.on("error", (error) => {
        server.config.logger.error(`Git watcher failed: ${error}`);
        watcher.close();
      });
      return watcher;
    });
  }

  return {
    name: "advanced-enriched-patch",
    async configureServer(viteServer) {
      server = viteServer;
      server.watcher.add(repositoryDirectory);
      for (const event of ["add", "change", "unlink"]) {
        server.watcher.on(event, onRepositoryChange);
      }
      await bindGitWatchers();

      server.middlewares.use(async (request, response, next) => {
        if (request.method === "GET" && request.url === "/__enriched-patch/default") {
          if (status === undefined) await (generation ?? regenerate());
          response.setHeader("Content-Type", "application/json");
          response.setHeader("Cache-Control", "no-store");
          response.end(JSON.stringify(status));
        } else if (request.method === "POST" && request.url === "/__enriched-patch/refresh") {
          clearTimeout(timer);
          timer = undefined;
          await regenerate();
          response.setHeader("Content-Type", "application/json");
          response.setHeader("Cache-Control", "no-store");
          response.end(JSON.stringify(status));
        } else {
          next();
        }
      });
    },
    async closeServer() {
      closed = true;
      clearTimeout(timer);
      for (const event of ["add", "change", "unlink"]) {
        server.watcher.off(event, onRepositoryChange);
      }
      for (const watcher of gitWatchers) watcher.close();
      if (generation !== undefined) await generation;
    },
  };
}
