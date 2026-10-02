import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { findDefaultHldManifest, hldManifestPlugin } from "../hld-gen-new/visualizer/hld-manifest-plugin.mjs";
import { hldManifestReferences } from "../hld-gen-new/visualizer/src/hld-manifest.ts";

test("writes candidate and selected HLD references with shared detailed requirements and opens the newest manifest", async (t) => {
  const repositoryDirectory = await mkdtemp(path.join(os.tmpdir(), "hld-manifest-"));
  t.after(() => rm(repositoryDirectory, { recursive: true, force: true }));
  const toolkitDirectory = path.join(repositoryDirectory, "ai-coding-toolkit");
  await mkdir(toolkitDirectory);
  await writeFile(path.join(toolkitDirectory, "config.json"), '{"outputDirectory":"docs/plans"}\n');
  const featureDirectory = path.join(repositoryDirectory, "docs/plans/example");
  const candidateDirectory = path.join(featureDirectory, "iterations/1/candidate-1");
  const generator = path.resolve("hld-gen-new/generate/write-hld-manifest.mjs");
  const detailedRequirements = path.join(featureDirectory, "example.detailed-requirements.md");
  await mkdir(featureDirectory, { recursive: true });
  await writeFile(detailedRequirements, "# example Detailed Requirements\n\n- Show a masked API-key field.\n");

  for (const directory of [candidateDirectory, featureDirectory]) {
    await mkdir(directory, { recursive: true });
    for (const suffix of ["hld.md", "sys-dataflow.json", "impl-dataflow.json"]) {
      await writeFile(path.join(directory, `example.${suffix}`), "{}\n");
    }
    execFileSync(process.execPath, [generator, path.join(directory, "example.hld.md"), detailedRequirements]);
    const manifest = JSON.parse(await readFile(path.join(directory, "example.hld-manifest.json"), "utf8"));
    assert.deepEqual(manifest, {
      hld: path.join(directory, "example.hld.md"),
      sysDataflow: path.join(directory, "example.sys-dataflow.json"),
      implDataflow: path.join(directory, "example.impl-dataflow.json"),
      detailedRequirements,
    });
    assert.deepEqual(hldManifestReferences(manifest), {
      hld: path.join(directory, "example.hld.md"),
      sysDataflow: path.join(directory, "example.sys-dataflow.json"),
      implDataflow: path.join(directory, "example.impl-dataflow.json"),
    });
  }

  assert.equal(await findDefaultHldManifest(repositoryDirectory, toolkitDirectory), path.join(featureDirectory, "example.hld-manifest.json"));

  let referenceMiddleware;
  hldManifestPlugin(repositoryDirectory, toolkitDirectory)[1].configureServer({
    middlewares: { use(middleware) { referenceMiddleware = middleware; } },
  });
  const reference = path.join(candidateDirectory, "example.sys-dataflow.json");
  let responseBody;
  const response = {
    statusCode: 200,
    setHeader() {},
    end(body) { responseBody = body; },
  };
  await referenceMiddleware({ method: "GET", url: `/__hld-manifest/reference?path=${encodeURIComponent(reference)}` }, response, () => assert.fail("Unexpected next middleware"));
  assert.deepEqual(JSON.parse(responseBody), { fileName: path.relative(repositoryDirectory, reference), contents: "{}\n" });
});

test("opens HLD manifests without detailed requirements", () => {
  const manifest = {
    hld: path.resolve("example.hld.md"),
    sysDataflow: path.resolve("example.sys-dataflow.json"),
    implDataflow: path.resolve("example.impl-dataflow.json"),
  };
  assert.deepEqual(hldManifestReferences(manifest), manifest);
});
