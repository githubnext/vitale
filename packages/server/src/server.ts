#!/usr/bin/env node
import corsMiddleware from "cors";
import * as Path from "node:path";
import type { ViteDevServer } from "vite";
import { createServer as createViteServer, send } from "vite";
import { WebSocketServer } from "ws";
import { Cells, cellIdRegex } from "./cells";
import rewrite from "./rewrite";
import { Rpc } from "./rpc";
import { Runtime } from "./runtime";
import { Options } from "./types";

const trailingSeparatorRE = /[?&]$/;
const timestampRE = /\bt=\d{13}&?\b/;
function removeTimestampQuery(url: string): string {
  return url.replace(timestampRE, "").replace(trailingSeparatorRE, "");
}
const htmlRE = /\bhtml&?\b/;
function removeHtmlQuery(url: string): string {
  return url.replace(htmlRE, "").replace(trailingSeparatorRE, "");
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

class VitaleDevServer {
  static async construct(options: Options) {
    const cells = new Cells();

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
            const cell = cells.get(id);
            return cell ? id : null;
          },
          load(id) {
            const cell = cells.get(id);
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
                cells.forPath(path)
              );
            }

            return cell.sourceDescription;
          },

          configureServer(server) {
            server.middlewares.use(corsMiddleware({}));

            server.middlewares.use(async (req, res, next) => {
              if (req.url) {
                const htmlQuery = htmlRE.test(req.url);
                const url = removeHtmlQuery(removeTimestampQuery(req.url));
                if (cells.get(Path.join(server.config.root, url))) {
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

    return new VitaleDevServer(viteServer, cells);
  }

  private viteServer: ViteDevServer;
  private runtime: Runtime;
  private rpc: Rpc;

  private constructor(viteServer: ViteDevServer, cells: Cells) {
    this.viteServer = viteServer;
    this.runtime = new Runtime(viteServer);
    this.rpc = new Rpc(cells, this.runtime);

    const wss = new WebSocketServer({ noServer: true });

    viteServer.httpServer?.on("upgrade", (request, socket, head) => {
      if (!request.url) return;
      const { pathname } = new URL(request.url, "http://localhost");
      if (pathname !== "/__vitale_api__") return;
      wss.handleUpgrade(request, socket, head, (ws) => {
        wss.emit("connection", ws, request);
        this.rpc.setupClient(ws);
      });
    });

    viteServer.watcher.on("change", (id) => {
      this.invalidateModuleAndDirty(id);
    });

    viteServer.watcher.on("add", (id) => {
      this.invalidateModuleAndDirty(id);
    });
  }

  private invalidateModuleAndDirty(id: string) {
    const cells: { path: string; cellId: string; ext: string }[] = [];
    this.runtime.invalidateRuntimeModule(id, cells);
    this.rpc.markCellsDirty(cells);
  }

  listen() {
    this.viteServer.listen();
  }
}

export function createServer(opts: { port: number }) {
  return VitaleDevServer.construct(opts);
}
