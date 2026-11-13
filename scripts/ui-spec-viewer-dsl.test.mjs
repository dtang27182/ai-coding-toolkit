import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { Readable } from "node:stream";
import test from "node:test";

import { uiDslParserPlugin } from "../common/ui-spec/viewer/ui-dsl-plugin.mjs";

test("the viewer converts a DSL file with the shared parser", async () => {
  let middleware;
  uiDslParserPlugin().configureServer({ middlewares: { use(handler) { middleware = handler; } } });
  const send = async (source) => {
    const request = Object.assign(Readable.from([source]), { method: "POST", url: "/__ui-spec/parse" });
    const response = {
      statusCode: 200,
      headers: {},
      setHeader(name, value) { this.headers[name] = value; },
      end(body) { this.body = body; },
    };
    await middleware(request, response, () => assert.fail("The parser request was not handled"));
    return response;
  };

  const source = await readFile(new URL("../common/ui-spec/ui-root.example.ui.dsl", import.meta.url), "utf8");
  const expected = JSON.parse(await readFile(new URL("../common/ui-spec/ui-root.example.ui.json", import.meta.url), "utf8"));
  const converted = await send(source);
  assert.equal(converted.statusCode, 200);
  assert.equal(converted.headers["Content-Type"], "application/json");
  assert.deepEqual(JSON.parse(converted.body), expected);

  const invalid = await send("app example { content_state {} page home { mystery item; } }");
  assert.equal(invalid.statusCode, 400);
  assert.match(invalid.body, /Unknown element kind.*at 1:\d+/);
});
