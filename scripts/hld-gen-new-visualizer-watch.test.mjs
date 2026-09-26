import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { watchDataflowFiles } from "../hld-gen-new/visualizer/watch-dataflow-files.mjs";
import { watchOpenedJson } from "../common/watch-opened-json.ts";

test("notifies the HLD visualizer when an output dataflow file changes", async (t) => {
  const repositoryDirectory = await mkdtemp(path.join(os.tmpdir(), "hld-dataflow-watch-"));
  t.after(() => rm(repositoryDirectory, { recursive: true, force: true }));
  const toolkitDirectory = path.join(repositoryDirectory, "ai-coding-toolkit");
  const outputDirectory = path.join(repositoryDirectory, "docs", "plans");
  await mkdir(toolkitDirectory);
  await mkdir(outputDirectory, { recursive: true });
  await writeFile(path.join(toolkitDirectory, "config.json"), '{"outputDirectory":"docs/plans"}\n');

  const listeners = new Map();
  const updates = [];
  let watchedDirectory;
  const server = {
    watcher: {
      add(directory) { watchedDirectory = directory; },
      on(event, callback) { listeners.set(event, callback); },
    },
    ws: { send(event, value) { updates.push({ event, value }); } },
    config: { logger: { error(message) { assert.fail(message); } } },
  };
  await watchDataflowFiles(repositoryDirectory, toolkitDirectory).configureServer(server);
  assert.equal(watchedDirectory, outputDirectory);

  for (const fileName of ["feature.system-dataflow.json", "feature.impl-dataflow.json"]) {
    const filePath = path.join(outputDirectory, fileName);
    await writeFile(filePath, `{"name":"${fileName}"}\n`);
    await listeners.get("change")(filePath);
    assert.deepEqual(updates.at(-1), {
      event: "hld-dataflow:file-change",
      value: {
        fileName: `docs/plans/${fileName}`,
        contents: await readFile(filePath, "utf8"),
      },
    });
  }

  await listeners.get("change")(path.join(repositoryDirectory, "outside.impl-dataflow.json"));
  await listeners.get("change")(path.join(outputDirectory, "notes.json"));
  assert.equal(updates.length, 2);
});

test("refreshes a selected JSON file when its handle returns new contents", async (t) => {
  const originalWindow = globalThis.window;
  let checkFile;
  let stopped = false;
  globalThis.window = {
    setInterval(callback) { checkFile = callback; return 1; },
    clearInterval() { stopped = true; },
  };
  t.after(() => { globalThis.window = originalWindow; });

  let contents = '{"feature":"before"}';
  const changes = [];
  const handle = {
    kind: "file",
    async getFile() { return { text: async () => contents }; },
  };
  const stop = watchOpenedJson(handle, contents, async (_file, nextContents) => {
    changes.push(nextContents);
  }, (error) => assert.fail(error));

  await checkFile();
  assert.deepEqual(changes, []);
  contents = '{"feature":"after"}';
  await checkFile();
  assert.deepEqual(changes, [contents]);
  await checkFile();
  assert.equal(changes.length, 1);
  stop();
  assert.equal(stopped, true);
});
