import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { EventEmitter } from "node:events";
import { mkdir, mkdtemp, readFile, realpath, rm, unlink, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";

import { advancedDiffViewerPlugin } from "../advanced-diff-viewer/visualizer/vite-plugin.mjs";

const toolkitDirectory = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const generatorPath = path.join(toolkitDirectory, "advanced-diff-viewer", "generate-enriched-patch.mjs");

function git(repositoryDirectory, argumentsList) {
  const result = spawnSync("git", argumentsList, { cwd: repositoryDirectory, encoding: "utf8" });
  assert.equal(result.status, 0, result.stderr);
  return result.stdout;
}

async function createServer(repositoryDirectory) {
  const watcher = new EventEmitter();
  watcher.add = () => {};
  const updates = new EventEmitter();
  const gitWatchers = [];
  let middleware;
  const plugin = advancedDiffViewerPlugin(repositoryDirectory, (directory, callback) => {
    const watcher = { directory, callback, closed: false, on() {}, close() { this.closed = true; } };
    gitWatchers.push(watcher);
    return watcher;
  });
  await plugin.configureServer({
    watcher,
    ws: { send(event, status) {
      if (event === "advanced-diff:refreshing") updates.emit("refreshing");
      else if (event === "advanced-diff:update") updates.emit("update", status);
    } },
    config: { logger: { error(message) { assert.fail(message); } } },
    middlewares: { use(handler) { middleware = handler; } },
  });
  async function request(method, url) {
    const response = {
      statusCode: 200,
      setHeader() {},
      end(body) { this.body = body; },
    };
    await middleware({ method, url }, response, () => assert.fail(`Unhandled ${method} ${url}`));
    assert.equal(response.statusCode, 200);
    return JSON.parse(response.body);
  }
  function emitGit(file) {
    for (const watcher of gitWatchers) {
      if (!watcher.closed && watcher.directory === path.dirname(file)) watcher.callback("rename", path.basename(file));
    }
  }
  return { watcher, updates, gitWatchers, request, emitGit, close: () => plugin.closeServer() };
}

function nextUpdate(updates, afterVersion) {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      updates.off("update", onUpdate);
      reject(new Error("Timed out waiting for enriched patch update"));
    }, 5000);
    function onUpdate(update) {
      if (update.version > afterVersion) {
        clearTimeout(timeout);
        updates.off("update", onUpdate);
        resolve(update);
      }
    }
    updates.on("update", onUpdate);
  });
}

test("generates a repeatable enriched patch for current changes without indexing its own output", async (t) => {
  const repositoryDirectory = await realpath(await mkdtemp(path.join(os.tmpdir(), "advanced-diff-viewer-")));
  let server;
  t.after(async () => {
    if (server !== undefined) await server.close();
    await rm(repositoryDirectory, { recursive: true, force: true });
  });
  git(repositoryDirectory, ["init", "--quiet"]);
  git(repositoryDirectory, ["config", "user.email", "test@example.com"]);
  git(repositoryDirectory, ["config", "user.name", "Test User"]);
  await writeFile(path.join(repositoryDirectory, "changed.ts"), "export const changed = 1;\n");
  await writeFile(path.join(repositoryDirectory, "staged.ts"), "export const staged = 1;\n");
  await writeFile(path.join(repositoryDirectory, "deleted.ts"), "export const deleted = 1;\n");
  git(repositoryDirectory, ["add", "."]);
  git(repositoryDirectory, ["commit", "--quiet", "-m", "base"]);

  await writeFile(path.join(repositoryDirectory, "changed.ts"), "export const changed = 2;\n");
  await writeFile(path.join(repositoryDirectory, "staged.ts"), "export const staged = 2;\n");
  git(repositoryDirectory, ["add", "staged.ts"]);
  await unlink(path.join(repositoryDirectory, "deleted.ts"));
  await writeFile(path.join(repositoryDirectory, "new.ts"), "export const added = true;\n");
  const indexBefore = git(repositoryDirectory, ["ls-files", "--stage"]);

  const firstRun = spawnSync(process.execPath, [generatorPath, repositoryDirectory], { encoding: "utf8" });
  assert.equal(firstRun.status, 0, firstRun.stderr);
  const outputFile = path.join(repositoryDirectory, "advanced-diff-viewer", "enriched-patch.json");
  const firstOutput = await readFile(outputFile, "utf8");
  const secondRun = spawnSync(process.execPath, [generatorPath, repositoryDirectory], { encoding: "utf8" });
  assert.equal(secondRun.status, 0, secondRun.stderr);
  assert.equal(await readFile(outputFile, "utf8"), firstOutput);
  assert.equal(git(repositoryDirectory, ["ls-files", "--stage"]), indexBefore);

  const index = JSON.parse(await readFile(outputFile, "utf8"));
  const indexedFiles = Object.values(index.elements)
    .filter((element) => element.kind === "file")
    .map((element) => element.name);
  assert.deepEqual(indexedFiles, ["changed.ts", "deleted.ts", "new.ts", "staged.ts"]);
  assert.doesNotMatch(index.patch, /advanced-diff-viewer\/enriched-patch\.json/);
  const originalDirectory = process.cwd();
  process.chdir(repositoryDirectory);
  try {
    const configPath = path.join(toolkitDirectory, "advanced-diff-viewer/visualizer/vite.config.mjs");
    const { default: config } = await import(`${pathToFileURL(configPath).href}?repository=${Date.now()}`);
    assert.equal(config.server.watch.usePolling, false);
    server = await createServer(repositoryDirectory);
    const response = await server.request("GET", "/__enriched-patch/default");
    assert.equal(response.state, "ready");
    assert.equal(response.fileName, "advanced-diff-viewer/enriched-patch.json");
    assert.equal(response.contents, firstOutput);
  } finally {
    process.chdir(originalDirectory);
  }
});

test("generates on first request and refreshes after repository changes", async (t) => {
  const repositoryDirectory = await realpath(await mkdtemp(path.join(os.tmpdir(), "advanced-diff-viewer-live-")));
  let server;
  t.after(async () => {
    if (server !== undefined) await server.close();
    await rm(repositoryDirectory, { recursive: true, force: true });
  });
  git(repositoryDirectory, ["init", "--quiet"]);
  git(repositoryDirectory, ["config", "user.email", "test@example.com"]);
  git(repositoryDirectory, ["config", "user.name", "Test User"]);
  const changedFile = path.join(repositoryDirectory, "changed.ts");
  await writeFile(changedFile, "export const changed = 1;\n");
  git(repositoryDirectory, ["add", "."]);
  git(repositoryDirectory, ["commit", "--quiet", "-m", "base"]);

  server = await createServer(repositoryDirectory);
  const initial = await server.request("GET", "/__enriched-patch/default");
  assert.equal(initial.state, "empty");
  await assert.rejects(readFile(path.join(repositoryDirectory, "advanced-diff-viewer/enriched-patch.json")), { code: "ENOENT" });

  const events = [];
  server.updates.on("refreshing", () => events.push("refreshing"));
  server.updates.on("update", () => events.push("update"));
  const changed = nextUpdate(server.updates, initial.version);
  await writeFile(changedFile, "export const changed = 2;\n");
  server.watcher.emit("change", changedFile);
  server.watcher.emit("change", changedFile);
  assert.deepEqual(events, ["refreshing"]);
  await changed;
  assert.deepEqual(events, ["refreshing", "update"]);
  const updated = await server.request("GET", "/__enriched-patch/default");
  assert.equal(updated.state, "ready");
  assert.equal(updated.version, initial.version + 1);
  assert.match(updated.contents, /export const changed = 2/);

  const addedFile = path.join(repositoryDirectory, "added.ts");
  const added = nextUpdate(server.updates, updated.version);
  await writeFile(addedFile, "export const added = true;\n");
  server.watcher.emit("add", addedFile);
  await added;
  const withAdded = await server.request("GET", "/__enriched-patch/default");
  assert.match(withAdded.contents, /added\.ts/);

  const deleted = nextUpdate(server.updates, withAdded.version);
  await unlink(addedFile);
  server.watcher.emit("unlink", addedFile);
  await deleted;
  const withoutAdded = await server.request("GET", "/__enriched-patch/default");
  assert.doesNotMatch(withoutAdded.contents, /added\.ts/);

  server.watcher.emit("change", path.join(repositoryDirectory, "advanced-diff-viewer/enriched-patch.json"));
  server.watcher.emit("change", path.join(repositoryDirectory, "ai-coding-toolkit/README.md"));
  const eventsBeforeRefresh = events.length;
  const refreshed = await server.request("POST", "/__enriched-patch/refresh");
  assert.equal(refreshed.version, withoutAdded.version + 1);
  assert.equal(refreshed.state, "ready");
  await new Promise((resolve) => setTimeout(resolve, 350));
  assert.equal(events.length, eventsBeforeRefresh + 1);
  assert.equal((await server.request("GET", "/__enriched-patch/default")).version, refreshed.version);

  const branch = git(repositoryDirectory, ["symbolic-ref", "--quiet", "HEAD"]).trim();
  git(repositoryDirectory, ["symbolic-ref", "HEAD", "refs/heads/missing"]);
  const failed = await server.request("POST", "/__enriched-patch/refresh");
  assert.equal(failed.state, "error");
  assert.equal(failed.contents, refreshed.contents);
  git(repositoryDirectory, ["symbolic-ref", "HEAD", branch]);
  const recovered = await server.request("POST", "/__enriched-patch/refresh");
  assert.equal(recovered.state, "ready");
  assert.equal(recovered.contents, refreshed.contents);

  const committed = nextUpdate(server.updates, recovered.version);
  git(repositoryDirectory, ["add", "."]);
  git(repositoryDirectory, ["commit", "--quiet", "-m", "updated"]);
  const reference = git(repositoryDirectory, ["rev-parse", "--git-path", branch]).trim();
  server.emitGit(path.resolve(repositoryDirectory, reference));
  await committed;
  const clean = await server.request("GET", "/__enriched-patch/default");
  assert.equal(clean.state, "empty");

  const switched = nextUpdate(server.updates, clean.version);
  git(repositoryDirectory, ["switch", "--quiet", "-c", "alternate"]);
  server.emitGit(path.join(repositoryDirectory, ".git/HEAD"));
  await switched;
  const alternate = await server.request("GET", "/__enriched-patch/default");
  assert.equal(alternate.state, "empty");

  const modified = nextUpdate(server.updates, alternate.version);
  await writeFile(changedFile, "export const changed = 3;\n");
  server.watcher.emit("change", changedFile);
  await modified;
  const onAlternate = await server.request("GET", "/__enriched-patch/default");
  assert.equal(onAlternate.state, "ready");

  const alternateCommit = nextUpdate(server.updates, onAlternate.version);
  git(repositoryDirectory, ["add", "."]);
  git(repositoryDirectory, ["commit", "--quiet", "-m", "alternate update"]);
  server.emitGit(path.join(repositoryDirectory, ".git/refs/heads/alternate"));
  await alternateCommit;
  assert.equal((await server.request("GET", "/__enriched-patch/default")).state, "empty");
});

test("resolves Git watchers and generates an index in a linked worktree", async (t) => {
  const workspace = await realpath(await mkdtemp(path.join(os.tmpdir(), "advanced-diff-worktree-")));
  const repositoryDirectory = path.join(workspace, "main");
  const worktreeDirectory = path.join(workspace, "linked");
  let server;
  t.after(async () => {
    if (server !== undefined) await server.close();
    await rm(workspace, { recursive: true, force: true });
  });
  await mkdir(repositoryDirectory);
  git(repositoryDirectory, ["init", "--quiet"]);
  git(repositoryDirectory, ["config", "user.email", "test@example.com"]);
  git(repositoryDirectory, ["config", "user.name", "Test User"]);
  await writeFile(path.join(repositoryDirectory, "file.ts"), "export const value = 1;\n");
  git(repositoryDirectory, ["add", "."]);
  git(repositoryDirectory, ["commit", "--quiet", "-m", "base"]);
  git(repositoryDirectory, ["worktree", "add", "--quiet", "-b", "linked", worktreeDirectory]);

  server = await createServer(worktreeDirectory);
  const head = git(worktreeDirectory, ["rev-parse", "--git-path", "HEAD"]).trim();
  assert.equal(server.gitWatchers.some((watcher) => watcher.directory === path.dirname(path.resolve(worktreeDirectory, head))), true);
  assert.equal((await server.request("GET", "/__enriched-patch/default")).state, "empty");

  const changedFile = path.join(worktreeDirectory, "file.ts");
  await writeFile(changedFile, "export const value = 2;\n");
  server.watcher.emit("change", changedFile);
  const updated = await server.request("POST", "/__enriched-patch/refresh");
  assert.equal(updated.state, "ready");
  assert.match(updated.contents, /export const value = 2/);
});
