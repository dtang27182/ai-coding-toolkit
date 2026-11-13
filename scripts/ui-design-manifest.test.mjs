import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdir, mkdtemp, readFile, rm, utimes, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import Ajv2020 from "ajv/dist/2020.js";

import { findDefaultUiDesignManifest, uiDesignManifestPlugin } from "../common/ui-spec/viewer/ui-design-manifest-plugin.mjs";
import { manifestFiles } from "../common/ui-spec/viewer/src/manifest.ts";

test("the UI design writer links all artifacts and the viewer opens available references", async (t) => {
  const repositoryDirectory = await mkdtemp(path.join(os.tmpdir(), "ui-design-manifest-"));
  t.after(() => rm(repositoryDirectory, { recursive: true, force: true }));
  const toolkitDirectory = path.join(repositoryDirectory, "ai-coding-toolkit");
  const featureDirectory = path.join(repositoryDirectory, "docs/plans/feature");
  await mkdir(toolkitDirectory);
  await mkdir(featureDirectory, { recursive: true });
  await writeFile(path.join(toolkitDirectory, "config.json"), '{"outputDirectory":"docs/plans"}\n');

  const oldUiDsl = path.join(featureDirectory, "feature.old.ui.dsl");
  const newUiDsl = path.join(featureDirectory, "feature.new.ui.dsl");
  const diffUiJson = path.join(featureDirectory, "feature.diff.ui.json");
  const dsl = await readFile(new URL("../common/ui-spec/ui-root.example.ui.dsl", import.meta.url), "utf8");
  const spec = await readFile(new URL("../common/ui-spec/ui-root.example.ui.json", import.meta.url), "utf8");
  await Promise.all([writeFile(oldUiDsl, dsl), writeFile(newUiDsl, dsl), writeFile(diffUiJson, spec)]);
  execFileSync(process.execPath, [new URL("../ui-design/generate/write-ui-design-manifest.mjs", import.meta.url).pathname, oldUiDsl]);

  const manifestPath = path.join(featureDirectory, "ui-design-manifest.json");
  const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
  const schema = JSON.parse(await readFile(new URL("../ui-design/generate/ui-design-manifest.schema.json", import.meta.url), "utf8"));
  const validate = new Ajv2020().compile(schema);
  assert.equal(validate(manifest), true, JSON.stringify(validate.errors));
  assert.deepEqual(manifest, { oldUiDsl, newUiDsl, diffUiJson });
  assert.deepEqual(manifestFiles({ oldUiDsl }), [{ key: "oldUiDsl", label: "Old UI", path: oldUiDsl }]);
  assert.equal(await findDefaultUiDesignManifest(repositoryDirectory, toolkitDirectory), manifestPath);

  let middleware;
  uiDesignManifestPlugin(repositoryDirectory, toolkitDirectory)[1].configureServer({ middlewares: { use(handler) { middleware = handler; } } });
  const requestReference = async (reference) => {
    const response = {
      statusCode: 200,
      setHeader() {},
      end(body) { this.body = body; },
    };
    await middleware({ method: "GET", url: `/__ui-spec/reference?path=${encodeURIComponent(reference)}` }, response, () => assert.fail("Reference request was not handled"));
    return response;
  };
  const converted = await requestReference(oldUiDsl);
  assert.equal(converted.statusCode, 200);
  assert.deepEqual(JSON.parse(JSON.parse(converted.body).contents), JSON.parse(spec));
  const diff = await requestReference(diffUiJson);
  assert.equal(diff.statusCode, 200);
  assert.deepEqual(JSON.parse(JSON.parse(diff.body).contents), JSON.parse(spec));

  await rm(newUiDsl);
  const missing = await requestReference(newUiDsl);
  assert.equal(missing.statusCode, 404);

  const nextDirectory = path.join(repositoryDirectory, "docs/plans/next");
  await mkdir(nextDirectory);
  const nextManifest = path.join(nextDirectory, "ui-design-manifest.json");
  await writeFile(nextManifest, JSON.stringify(manifest));
  await utimes(manifestPath, new Date(1000), new Date(1000));
  await utimes(nextManifest, new Date(2000), new Date(2000));
  assert.equal(await findDefaultUiDesignManifest(repositoryDirectory, toolkitDirectory), nextManifest);
});
