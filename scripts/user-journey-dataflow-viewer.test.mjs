import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm, utimes, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { defaultSystemDataflowPlugin } from "../common/sys-dataflow/visualizer/vite-plugin.mjs";
import { watchJourneyDataflows } from "../user-journey-dataflow/visualizer/watch-journey-dataflows.mjs";

test("the journey viewer opens its newest output and refreshes it", async (t) => {
  const repositoryDirectory = await mkdtemp(path.join(os.tmpdir(), "journey-dataflow-viewer-"));
  t.after(() => rm(repositoryDirectory, { recursive: true, force: true }));
  const toolkitDirectory = path.join(repositoryDirectory, "ai-coding-toolkit");
  const outputDirectory = path.join(repositoryDirectory, "docs/plans");
  const journeyDirectory = path.join(outputDirectory, "user-journey-dataflow");
  await mkdir(toolkitDirectory);
  await mkdir(journeyDirectory, { recursive: true });
  await writeFile(path.join(toolkitDirectory, "config.json"), '{"outputDirectory":"docs/plans"}\n');

  const older = path.join(journeyDirectory, "older.sys-dataflow.json");
  const newest = path.join(journeyDirectory, "newest.sys-dataflow.json");
  const unrelated = path.join(outputDirectory, "design.sys-dataflow.json");
  await writeFile(older, '{"feature":"older"}');
  await writeFile(newest, '{"feature":"newest"}');
  await writeFile(unrelated, '{"feature":"unrelated"}');
  await utimes(older, new Date(1_000), new Date(1_000));
  await utimes(newest, new Date(2_000), new Date(2_000));
  await utimes(unrelated, new Date(3_000), new Date(3_000));

  let middleware;
  defaultSystemDataflowPlugin(repositoryDirectory, toolkitDirectory, "user-journey-dataflow").configureServer({
    middlewares: { use(callback) { middleware = callback; } },
  });
  let responseBody;
  const response = {
    setHeader() {},
    end(body) { responseBody = body; },
  };
  await middleware({ method: "GET", url: "/__system-dataflow/default" }, response, () => assert.fail("Unexpected next middleware"));
  assert.deepEqual(JSON.parse(responseBody), {
    fileName: "docs/plans/user-journey-dataflow/newest.sys-dataflow.json",
    contents: await readFile(newest, "utf8"),
  });

  const listeners = new Map();
  const messages = [];
  let watchedDirectory;
  await watchJourneyDataflows(repositoryDirectory, toolkitDirectory).configureServer({
    watcher: {
      add(directory) { watchedDirectory = directory; },
      on(event, callback) { listeners.set(event, callback); },
    },
    ws: { send(...message) { messages.push(message); } },
  });
  assert.equal(watchedDirectory, journeyDirectory);
  await listeners.get("change")(newest);
  assert.deepEqual(messages.pop(), ["hld-dataflow:file-change", {
    fileName: "docs/plans/user-journey-dataflow/newest.sys-dataflow.json",
    contents: await readFile(newest, "utf8"),
  }]);
  await listeners.get("add")(older);
  assert.deepEqual(messages.pop(), [{ type: "full-reload" }]);
  await listeners.get("change")(unrelated);
  assert.equal(messages.length, 0);
});
