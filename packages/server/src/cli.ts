#!/usr/bin/env node
import { createServer as createViteServer } from "vite";
import { type WebSocket, WebSocketServer } from "ws";
import { createBirpc, type BirpcReturn } from "birpc";
import type { WebSocketEvents, WebSocketHandlers } from "./types";
import JSON5 from "json5";

const clients = new Map<
  WebSocket,
  BirpcReturn<WebSocketEvents, WebSocketHandlers>
>();

function setupClient(ws: WebSocket) {
  const rpc = createBirpc<WebSocketEvents, WebSocketHandlers>(
    {
      ping: async () => {
        console.log("ping");
        return "pong";
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

async function createServer() {
  const server = await createViteServer();

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

  server.listen();
}

createServer();
