#!/usr/bin/env node
import { createServer as createViteServer, send } from "vite";
import { ESModulesRunner, ViteRuntime } from "vite/runtime";
import { type WebSocket, WebSocketServer } from "ws";
import { createBirpc, type BirpcReturn } from "birpc";
import type { CellOutput, ClientFunctions, ServerFunctions } from "./types";
import JSON5 from "json5";
import * as Path from "node:path";
import type { ParserOptions } from "@babel/parser";
import * as babelParser from "@babel/parser";
import * as babelTypes from "@babel/types";
import * as babelGenerator from "@babel/generator";
import corsMiddleware from "cors";

const clients = new Map<
  WebSocket,
  BirpcReturn<ClientFunctions, ServerFunctions>
>();

const cellIdRegex = /^([^?]+\.vnb)\?cellId=([a-zA-z0-9_-]{21})\.([a-z]+)$/;

const trailingSeparatorRE = /[?&]$/;
const timestampRE = /\bt=\d{13}&?\b/;
export function removeTimestampQuery(url: string): string {
  return url.replace(timestampRE, "").replace(trailingSeparatorRE, "");
}

type SourceDescription = {
  code: string;
  ast: babelTypes.Program;
};

const cells = new Map<string, SourceDescription>();

const server = await createViteServer({
  server: { host: "127.0.0.1" },
  plugins: [
    {
      name: "vitale",
      resolveId(source) {
        return cells.has(source) ? source : null;
      },
      load(id) {
        return cells.has(id) ? cells.get(id)!.code : null;
      },

      configureServer(server) {
        server.middlewares.use(corsMiddleware({}));

        // this is the core of `transformMiddleware` from vite
        // we must reimplement it in order to serve `.vnb?cellId` paths
        server.middlewares.use(async (req, res, next) => {
          if (req.url) {
            const url = removeTimestampQuery(req.url);
            if (cellIdRegex.test(url)) {
              const result = await server.transformRequest(url);
              if (result) {
                return send(req, res, result.code, "js", {
                  etag: result.etag,
                  cacheControl: "no-cache",
                  headers: server.config.server.headers,
                  map: result.map,
                });
              }
            }
          }
          next();
        });
      },
    },
  ],
});

const runtime = new ViteRuntime(
  {
    root: server.config.root,
    fetchModule: server.ssrFetchModule,
  },
  new ESModulesRunner()
);

function rewriteCode(code: string, language: string): SourceDescription {
  const plugins = ((): ParserOptions["plugins"] => {
    switch (language) {
      case "typescriptreact":
        return ["typescript", "jsx"];
      case "typescript":
        return ["typescript"];
      case "javascriptreact":
        return ["jsx"];
      case "javascript":
        return [];
      default:
        throw new Error(`unknown language: ${language}`);
    }
  })();
  const parserOptions: ParserOptions = { sourceType: "module", plugins };

  let program: babelTypes.Program;

  let exprAst: undefined | babelTypes.Expression;
  try {
    exprAst = babelParser.parseExpression(code, parserOptions);
  } catch {}

  if (exprAst) {
    program = babelTypes.program([
      babelTypes.exportDefaultDeclaration(exprAst),
    ]);
  } else {
    const ast = babelParser.parse(code, parserOptions);
    if (ast.program.body.length === 0) {
      program = babelTypes.program([
        babelTypes.exportDefaultDeclaration(babelTypes.buildUndefinedNode()),
      ]);
    } else {
      program = ast.program;
      const body = ast.program.body;
      const last = body[body.length - 1];
      if (last.type === "ExpressionStatement") {
        const defaultExport = babelTypes.exportDefaultDeclaration(
          last.expression
        );
        body[body.length - 1] = defaultExport;
      }
    }
  }
  const generatorResult = new babelGenerator.CodeGenerator(program).generate();
  return { ast: program, code: generatorResult.code };
}

interface PossibleSVG {
  outerHTML: string;
}

function isSVGElementLike(obj: unknown): obj is PossibleSVG {
  return (
    obj !== null &&
    typeof obj === "object" &&
    "outerHTML" in obj &&
    typeof obj.outerHTML === "string" &&
    obj.outerHTML.startsWith("<svg")
  );
}

interface PossibleHTML {
  outerHTML: string;
}

function isHTMLElementLike(obj: unknown): obj is PossibleHTML {
  return (
    obj !== null &&
    typeof obj === "object" &&
    "outerHTML" in obj &&
    typeof obj.outerHTML === "string"
  );
}

async function executeCell(id: string, path: string, cellId: string) {
  // TODO(jaked)

  // await so client finishes startCellExecution before we send endCellExecution
  // would be better for client to lock around startCellExecution
  await Promise.all(
    Array.from(clients.values()).map((client) =>
      client.startCellExecution(path, cellId)
    )
  );

  let data;
  let mime;

  // client execution
  if (cells.get(id)?.ast.directives[0]?.value.value === "use client") {
    data = JSON.stringify({
      // TODO(jaked) strip workspace root when executeCell is called
      id: id.substring(server.config.root.length + 1),
    });
    mime = "application/x-vitale";
  }

  // server execution
  else {
    try {
      let { default: result } = await runtime.executeUrl(id);
      if (result instanceof Promise) result = await result;
      if (
        typeof result === "object" &&
        "data" in result &&
        typeof result.data === "string" &&
        "mime" in result &&
        typeof result.mime === "string"
      ) {
        mime = result.mime;
        data = result.data;
      } else if (isSVGElementLike(result)) {
        mime = "image/svg+xml";
        data = result.outerHTML;
      } else if (isHTMLElementLike(result)) {
        mime = "text/html";
        data = result.outerHTML;
      } else if (typeof result === "object") {
        mime = "application/json";
        data = JSON.stringify(result);
      } else {
        mime = "text/x-javascript";
        data = JSON.stringify(result);
      }
    } catch (e) {
      const err = e as Error;
      const obj = {
        name: err.name,
        message: err.message,
        stack: err.stack,
      };
      data = JSON.stringify(obj, undefined, "\t");
      mime = "application/vnd.code.notebook.error";
    }
  }

  const cellOutput: CellOutput = {
    items:
      data === undefined
        ? []
        : [{ data: [...Buffer.from(data, "utf8").values()], mime }],
  };

  return await Promise.all(
    Array.from(clients.values()).map((client) =>
      client.endCellExecution(path, cellId, cellOutput)
    )
  );
}

function invalidateModule(id: string) {
  const mod = runtime.moduleCache.get(id);
  runtime.moduleCache.delete(id);

  const match = cellIdRegex.exec(id);
  if (match) {
    const [_, path, cellId] = match;
    executeCell(id, path, cellId);
  }

  for (const dep of mod.importers ?? []) {
    invalidateModule(Path.join(server.config.root, dep));
  }
}

function setupClient(ws: WebSocket) {
  const rpc = createBirpc<ClientFunctions, ServerFunctions>(
    {
      ping: async () => {
        console.log("ping");
        return "pong";
      },
      executeCell(path, cellId, language, code) {
        const ext = (() => {
          switch (language) {
            case "typescriptreact":
              return "tsx";
            case "typescript":
              return "ts";
            case "javascriptreact":
              return "jsx";
            case "javascript":
              return "js";
            default:
              throw new Error(`unknown language "${language}"`);
          }
        })();
        const id = `${path}?cellId=${cellId}.${ext}`;
        cells.set(id, rewriteCode(code, language));

        const mod = server.moduleGraph.getModuleById(id);
        if (mod) server.moduleGraph.invalidateModule(mod);

        invalidateModule(id);
      },
    },
    {
      post: (msg) => ws.send(msg),
      on: (fn) => ws.on("message", fn),
      serialize: (v) => JSON5.stringify(v),
      deserialize: (v) => JSON5.parse(v),
    }
  );

  clients.set(ws, rpc);
  ws.on("close", () => {
    clients.delete(ws);
  });
}

async function start() {
  const wss = new WebSocketServer({ noServer: true });

  server.httpServer?.on("upgrade", (request, socket, head) => {
    if (!request.url) return;
    const { pathname } = new URL(request.url, "http://localhost");
    if (pathname !== "/__vitale_api__") return;
    wss.handleUpgrade(request, socket, head, (ws) => {
      wss.emit("connection", ws, request);
      setupClient(ws);
    });
  });

  server.watcher.on("change", (id) => {
    invalidateModule(id);
  });

  server.watcher.on("add", (id) => {
    invalidateModule(id);
  });

  server.listen();
}

start();
