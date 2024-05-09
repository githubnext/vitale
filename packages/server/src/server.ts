#!/usr/bin/env node
import { createBirpc, type BirpcReturn } from "birpc";
import corsMiddleware from "cors";
import JSON5 from "json5";
import * as Path from "node:path";
import type { ViteDevServer } from "vite";
import { createServer as createViteServer, send } from "vite";
import { ESModulesRunner, ViteRuntime } from "vite/runtime";
import { WebSocketServer, type WebSocket } from "ws";
import rewrite from "./rewrite";
import type { CellOutput, ClientFunctions, ServerFunctions } from "./types";
import { Cell, Options } from "./types";
import { handleHMRUpdate } from "./hmr";

const trailingSeparatorRE = /[?&]$/;
const timestampRE = /\bt=\d{13}&?\b/;
function removeTimestampQuery(url: string): string {
  return url.replace(timestampRE, "").replace(trailingSeparatorRE, "");
}
const htmlRE = /\bhtml&?\b/;
function removeHtmlQuery(url: string): string {
  return url.replace(htmlRE, "").replace(trailingSeparatorRE, "");
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

const cellIdRegex = /^([^?]+\.vnb)-cellId=([a-zA-z0-9_-]{21})\.([a-z]+)$/;

function extOfLanguage(language: string): string {
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
}

function makeHtmlSource(url: string) {
  const [_, _path, cellId] = cellIdRegex.exec(url)!;
  return `
<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Vitale</title>
  </head>
  <body>
    <div id="cell-output-root-${cellId}"></div>
    <script type="module" src="${url}"></script>
    <script>
      if (window.parent !== window) {
        const observer = new ResizeObserver((entries) => {
          const msg = {
            type: "resize-iframe",
            cellId: "${cellId}",
            height: entries[0].borderBoxSize[0].blockSize,
          };
          window.parent.postMessage(msg, "*");
        });
        observer.observe(document.getElementsByTagName('html')[0], { box: "border-box" });
      }
    </script>
  </body>
</html>
`;
}

function getCellById(cellsByPath: Map<string, Map<string, Cell>>, id: string) {
  const match = cellIdRegex.exec(id);
  if (match) {
    const [_, path, cellId, ext] = match;
    const cells = cellsByPath.get(path);
    if (cells) {
      const cell = cells.get(cellId);
      if (cell && extOfLanguage(cell.language) === ext) {
        return cell;
      }
    }
  }
  return null;
}

function setCellById(
  cellsByPath: Map<string, Map<string, Cell>>,
  id: string,
  cell: Cell
) {
  const match = cellIdRegex.exec(id);
  if (match) {
    const [_, path, cellId] = match;
    let cells = cellsByPath.get(path);
    if (!cells) {
      cells = new Map();
      cellsByPath.set(path, cells);
    }
    cells.set(cellId, cell);
  }
}

function deleteCellById(
  cellsByPath: Map<string, Map<string, Cell>>,
  id: string
) {
  const match = cellIdRegex.exec(id);
  if (match) {
    const [_, path, cellId] = match;
    const cells = cellsByPath.get(path);
    if (cells) {
      cells.delete(cellId);
    }
  }
}

class VitaleDevServer {
  static async construct(options: Options) {
    const cellsByPath: Map<string, Map<string, Cell>> = new Map();

    let origin;
    const codespaceName = process.env.CODESPACE_NAME;
    const codespaceDomain =
      process.env.GITHUB_CODESPACES_PORT_FORWARDING_DOMAIN;
    if (codespaceName && codespaceDomain) {
      origin = `https://${codespaceName}-${options.port}.${codespaceDomain}`;
    } else {
      origin = `http://127.0.0.1:${options.port}`;
    }

    const viteServer = await createViteServer({
      server: {
        port: options.port,
        host: "127.0.0.1",
        strictPort: true,
        origin,
      },
      plugins: [
        {
          name: "vitale",
          resolveId(source) {
            const id = source.startsWith(viteServer.config.root)
              ? source
              : Path.join(viteServer.config.root, source);
            const cell = getCellById(cellsByPath, id);
            return cell ? id : null;
          },
          load(id) {
            const cell = getCellById(cellsByPath, id);
            if (!cell) {
              return null;
            }

            if (!cell.sourceDescription) {
              const [_, path] = cellIdRegex.exec(id)!;
              cell.sourceDescription = rewrite(
                cell.code,
                cell.language,
                id,
                cell.cellId,
                cellsByPath.get(path)!
              );
            }

            return cell.sourceDescription.code;
          },

          configureServer(server) {
            server.middlewares.use(corsMiddleware({}));

            server.middlewares.use(async (req, res, next) => {
              if (req.url) {
                const htmlQuery = htmlRE.test(req.url);
                const url = removeHtmlQuery(removeTimestampQuery(req.url));
                if (
                  getCellById(cellsByPath, Path.join(server.config.root, url))
                ) {
                  if (htmlQuery) {
                    const html = await server.transformIndexHtml(
                      url,
                      makeHtmlSource(url)
                    );
                    return send(req, res, html, "html", {
                      headers: server.config.server.headers,
                    });
                  } else {
                    // this is the core of `transformMiddleware` from vite
                    // we must reimplement it in order to serve `.vnb-cellId` paths
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
              }
              next();
            });
          },
        },
      ],
    });

    return new VitaleDevServer(viteServer, cellsByPath);
  }

  private viteServer: ViteDevServer;
  private viteRuntime: ViteRuntime;
  private clients: Map<
    WebSocket,
    BirpcReturn<ClientFunctions, ServerFunctions>
  > = new Map();
  private cellsByPath: Map<string, Map<string, Cell>>;

  private constructor(
    viteServer: ViteDevServer,
    cellsByPath: Map<string, Map<string, Cell>>
  ) {
    this.viteServer = viteServer;
    this.cellsByPath = cellsByPath;

    this.viteRuntime = new ViteRuntime(
      {
        root: viteServer.config.root,
        fetchModule: viteServer.ssrFetchModule,
      },
      new ESModulesRunner()
    );

    const wss = new WebSocketServer({ noServer: true });

    viteServer.httpServer?.on("upgrade", (request, socket, head) => {
      if (!request.url) return;
      const { pathname } = new URL(request.url, "http://localhost");
      if (pathname !== "/__vitale_api__") return;
      wss.handleUpgrade(request, socket, head, (ws) => {
        wss.emit("connection", ws, request);
        this.setupClient(ws);
      });
    });

    viteServer.watcher.on("change", (id) => {
      this.invalidateModuleAndDirty(id);
    });

    viteServer.watcher.on("add", (id) => {
      this.invalidateModuleAndDirty(id);
    });
  }

  private async executeCell(
    id: string,
    path: string,
    cellId: string,
    force: boolean
  ) {
    // TODO(jaked)
    // await so client finishes startCellExecution before we send endCellExecution
    // would be better for client to lock around startCellExecution
    const startOK = (
      await Promise.all(
        Array.from(this.clients.values()).map((client) =>
          client.startCellExecution(path, cellId, force)
        )
      )
    ).every((ok) => ok);
    if (!startOK) {
      return false;
    }

    let data;
    let mime;

    try {
      const cell = getCellById(this.cellsByPath, id);
      if (!cell) throw new Error(`cell not found: ${id}`);

      if (!cell.sourceDescription) {
        const [_, path] = cellIdRegex.exec(id)!;
        cell.sourceDescription = rewrite(
          cell.code,
          cell.language,
          id,
          cell.cellId,
          this.cellsByPath.get(path)!
        );
      }

      // client execution
      if (cell.sourceDescription.type === "client") {
        data = JSON.stringify({
          // TODO(jaked) strip workspace root when executeCell is called
          id: id.substring(this.viteServer.config.root.length + 1),
          origin: this.viteServer.config.server.origin,
        });
        mime = "application/x-vitale";
      }

      // server execution
      else {
        let { default: result } = await this.viteRuntime.executeUrl(id);
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

    const cellOutput: CellOutput = {
      items:
        data === undefined
          ? []
          : [{ data: [...Buffer.from(data, "utf8").values()], mime }],
    };

    await Promise.all(
      Array.from(this.clients.values()).map((client) =>
        client.endCellExecution(path, cellId, cellOutput)
      )
    );
    return true;
  }

  private invalidateModule(
    id: string,
    dirtyCells: { path: string; cellId: string; ext: string }[]
  ) {
    const mod = this.viteRuntime.moduleCache.get(id);
    this.viteRuntime.moduleCache.delete(id);

    const match = cellIdRegex.exec(id);
    if (match) {
      const [_, path, cellId, ext] = match;
      if (
        !dirtyCells.some((cell) => cell.path === path && cell.cellId === cellId)
      ) {
        dirtyCells.push({ path, cellId, ext });
      }
    }

    for (const dep of mod.importers ?? []) {
      this.invalidateModule(
        Path.join(this.viteServer.config.root, dep),
        dirtyCells
      );
    }
  }

  private markCellsDirty(cells: { path: string; cellId: string }[]) {
    if (cells.length === 0) {
      return;
    }
    for (const client of this.clients.values()) {
      client.markCellsDirty(cells);
    }
  }

  private invalidateModuleAndDirty(id: string) {
    const cells: { path: string; cellId: string; ext: string }[] = [];
    this.invalidateModule(id, cells);
    this.markCellsDirty(cells);
  }

  private async executeCellsRPC(
    cells: {
      path: string;
      cellId: string;
      language: string;
      code?: string;
    }[],
    force: boolean,
    executeDirtyCells: boolean
  ) {
    let dirtyCells: { path: string; cellId: string; ext: string }[] = [];

    for (const { path, cellId, language, code } of cells) {
      const ext = extOfLanguage(language);
      const id = `${path}-cellId=${cellId}.${ext}`;
      if (code) {
        setCellById(this.cellsByPath, id, { cellId, code, language });
      }

      const mod = this.viteServer.moduleGraph.getModuleById(id);
      if (mod) {
        this.viteServer.moduleGraph.invalidateModule(mod);
        handleHMRUpdate(id, this.viteServer);
      }

      this.invalidateModule(id, dirtyCells);
    }

    dirtyCells = dirtyCells.filter(
      (dirtyCell) =>
        !cells.some(
          (cell) =>
            cell.path === dirtyCell.path && cell.cellId === dirtyCell.cellId
        )
    );

    const cellsToExecute = [
      ...cells.map(({ path, cellId, language }) => ({
        path,
        cellId,
        ext: extOfLanguage(language),
        force,
      })),
      ...(executeDirtyCells
        ? dirtyCells.map((cell) => ({ ...cell, force: false }))
        : []),
    ];

    const executed = await Promise.all(
      cellsToExecute.map(({ path, cellId, ext, force }) =>
        this.executeCell(`${path}-cellId=${cellId}.${ext}`, path, cellId, force)
      )
    );

    const cellsToMarkDirty = cellsToExecute.filter(
      ({ force }, i) => !force && !executed[i]
    );
    this.markCellsDirty(cellsToMarkDirty);
  }

  private removeCellsRPC(
    cells: {
      path: string;
      cellId: string;
      language: string;
    }[]
  ) {
    let dirtyCells: { path: string; cellId: string; ext: string }[] = [];

    for (const { path, cellId, language } of cells) {
      const ext = extOfLanguage(language);
      const id = `${path}-cellId=${cellId}.${ext}`;
      deleteCellById(this.cellsByPath, id);

      const mod = this.viteServer.moduleGraph.getModuleById(id);
      if (mod) {
        this.viteServer.moduleGraph.invalidateModule(mod);
        // TODO(jaked) HMR remove?
      }

      this.invalidateModule(id, dirtyCells);
    }

    // don't mark cells dirty if they were just removed
    dirtyCells = dirtyCells.filter(
      (dirtyCell) =>
        !cells.some(
          (cell) =>
            cell.path === dirtyCell.path && cell.cellId === dirtyCell.cellId
        )
    );
    this.markCellsDirty(dirtyCells);
  }

  private setupClient(ws: WebSocket) {
    const self = this;
    const rpc = createBirpc<ClientFunctions, ServerFunctions>(
      {
        ping: async () => {
          console.log("ping");
          return "pong";
        },
        async executeCells(cells, force, executeDirtyCells) {
          try {
            return self.executeCellsRPC(cells, force, executeDirtyCells);
          } catch (e) {
            console.error(e);
          }
        },
        async removeCells(cells) {
          try {
            return self.removeCellsRPC(cells);
          } catch (e) {
            console.error(e);
          }
        },
      },
      {
        post: (msg) => ws.send(msg),
        on: (fn) => ws.on("message", fn),
        serialize: (v) => JSON5.stringify(v),
        deserialize: (v) => JSON5.parse(v),
      }
    );

    this.clients.set(ws, rpc);
    ws.on("close", () => {
      this.clients.delete(ws);
    });
  }

  listen() {
    this.viteServer.listen();
  }
}

export function createServer(opts: { port: number }) {
  return VitaleDevServer.construct(opts);
}
