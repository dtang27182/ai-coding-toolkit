import { parseSpec } from "../parser/parser.ts";

function installParser(server) {
  server.middlewares.use(async (request, response, next) => {
    if (request.method === "POST" && request.url === "/__ui-spec/parse") {
      try {
        let source = "";
        for await (const chunk of request) source += chunk;
        const spec = parseSpec(source);
        response.setHeader("Content-Type", "application/json");
        response.end(JSON.stringify(spec));
      } catch (error) {
        response.statusCode = 400;
        response.end(error instanceof Error ? error.message : String(error));
      }
    } else {
      next();
    }
  });
}

export function uiDslParserPlugin() {
  return {
    name: "ui-dsl-parser",
    configureServer: installParser,
    configurePreviewServer: installParser,
  };
}
