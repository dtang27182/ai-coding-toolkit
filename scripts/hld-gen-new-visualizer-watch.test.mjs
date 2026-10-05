import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { stripTypeScriptTypes } from "node:module";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { runInNewContext } from "node:vm";

import { hldManifestReferences } from "../hld-gen-new/visualizer/src/hld-manifest.ts";
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

  for (const fileName of ["feature.sys-dataflow.json", "feature.cr.sys-dataflow.json", "feature.impl-dataflow.json", "feature.hld-manifest.json"]) {
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
  assert.equal(updates.length, 4);
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

test("refreshes referenced dataflows for automatically and manually opened manifests", async (t) => {
  const mainSource = await readFile(new URL("../hld-gen-new/visualizer/src/main.ts", import.meta.url), "utf8");
  const watcherSource = await readFile(new URL("../common/watch-opened-json.ts", import.meta.url), "utf8");
  const source = stripTypeScriptTypes(watcherSource).replaceAll("export ", "") +
    stripTypeScriptTypes(mainSource).replace(/^import .*\n/gm, "").replace("import.meta.hot", "hot");

  for (const opening of ["default", "picker", "input", "drop"]) {
    await t.test(opening, async () => {
      const manifest = {
        hld: "/repository/docs/plans/feature.hld.md",
        sysDataflow: "/repository/docs/plans/feature.sys-dataflow.json",
        implDataflow: "/repository/docs/plans/feature.impl-dataflow.json",
      };
      const manifestPath = "docs/plans/feature.hld-manifest.json";
      const file = { name: "feature.hld-manifest.json", text: async () => JSON.stringify(manifest) };
      const elements = new Map();
      const events = new Map();
      const messages = { system: [], implementation: [] };
      const values = new Map([
        [manifest.sysDataflow, { revision: "system-before" }],
        [manifest.implDataflow, { revision: "implementation-before" }],
      ]);
      for (const view of ["system", "implementation"]) {
        elements.set(`[data-panel="${view}"] iframe`, {
          contentDocument: null,
          contentWindow: { postMessage(message) { messages[view].push(structuredClone(message)); } },
          addEventListener() {},
        });
      }
      for (const selector of ["#open-hld-manifest", "#hld-manifest-input", ".review-path"]) {
        elements.set(selector, {
          files: [file],
          classList: { toggle() {} },
          addEventListener(event, callback) { events.set(`${selector}:${event}`, callback); },
        });
      }
      const app = {
        querySelector(selector) { return elements.get(selector); },
        querySelectorAll(selector) { return selector === "iframe" ? [elements.get('[data-panel="system"] iframe'), elements.get('[data-panel="implementation"] iframe')] : []; },
        addEventListener(event, callback) { events.set(event, callback); },
      };
      const window = { setInterval() { return 1; }, clearInterval() {} };
      if (opening === "picker") {
        window.showOpenFilePicker = async () => [{ kind: "file", getFile: async () => file }];
      }
      runInNewContext(source, {
        document: { querySelector() { return app; } },
        window,
        location: { origin: "http://localhost" },
        hldManifestReferences,
        hot: { on(event, callback) { events.set(event, callback); } },
        async fetch(url) {
          if (url === "/__hld-manifest/default") {
            return { status: opening === "default" ? 200 : 204, ok: true, json: async () => ({ fileName: manifestPath, contents: JSON.stringify(manifest) }) };
          } else {
            const reference = new URL(url, "http://localhost").searchParams.get("path");
            assert.equal(values.has(reference), true);
            return { ok: true, json: async () => ({ fileName: path.relative("/repository", reference), contents: JSON.stringify(values.get(reference)) }) };
          }
        },
      });
      await new Promise(setImmediate);
      if (opening === "picker") {
        events.get("#open-hld-manifest:click")();
      } else if (opening === "input") {
        events.get("#hld-manifest-input:change")({ currentTarget: elements.get("#hld-manifest-input") });
      } else if (opening === "drop") {
        events.get("drop")({ preventDefault() {}, stopPropagation() {}, dataTransfer: { items: [], files: [file] } });
      }
      await new Promise(setImmediate);
      assert.equal(messages.system.length, 1);
      assert.equal(messages.implementation.length, 1);

      for (const [reference, view] of [[manifest.sysDataflow, "system"], [manifest.implDataflow, "implementation"], [manifest.sysDataflow, "system"]]) {
        values.set(reference, { revision: `${view}-${messages[view].length}` });
        events.get("hld-dataflow:file-change")({ fileName: path.relative("/repository", reference), contents: JSON.stringify(values.get(reference)) });
        await new Promise(setImmediate);
        assert.deepEqual(messages[view].at(-1).value, values.get(reference));
      }
      const count = messages.system.length;
      events.get("hld-dataflow:file-change")({ fileName: "other/feature.sys-dataflow.json", contents: '{}' });
      await new Promise(setImmediate);
      assert.equal(messages.system.length, count);
      if (opening === "default") {
        values.set(manifest.sysDataflow, { revision: "manifest-refresh" });
        events.get("hld-dataflow:file-change")({ fileName: manifestPath, contents: JSON.stringify(manifest) });
        await new Promise(setImmediate);
        assert.deepEqual(messages.system.at(-1).value, values.get(manifest.sysDataflow));
      } else {
        events.get("hld-dataflow:file-change")({ fileName: file.name, contents: JSON.stringify(manifest) });
        await new Promise(setImmediate);
        assert.equal(messages.system.length, count);
      }
    });
  }
});
