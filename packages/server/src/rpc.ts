import * as vscode from "vscode";
import { createBirpc, type BirpcReturn } from "birpc";
import JSON5 from "json5";
import type WebSocket from "ws";
import type { CellOutput, ClientFunctions, ServerFunctions } from "./rpc-types";
import { Client } from "./client";

export class Rpc {
  private clients: Map<
    WebSocket,
    BirpcReturn<ClientFunctions, ServerFunctions>
  > = new Map();

  startCellExecution(path: string, cellId: string, force: boolean) {
    return Promise.all(
      Array.from(this.clients.values()).map((client) =>
        client.startCellExecution(path, cellId, force)
      )
    ).then((oks) => oks.every((ok) => ok));
  }

  outputStdout(path: string, cellId: string, output: string) {
    for (const client of this.clients.values()) {
      client.outputStdout(path, cellId, output);
    }
  }

  outputStderr(path: string, cellId: string, output: string) {
    for (const client of this.clients.values()) {
      client.outputStderr(path, cellId, output);
    }
  }

  updateCellOutput(path: string, cellId: string, cellOutput: CellOutput) {
    return Promise.all(
      Array.from(this.clients.values()).map((client) =>
        client.updateCellOutput(path, cellId, cellOutput)
      )
    );
  }

  endCellExecution(path: string, cellId: string, cellOutput?: CellOutput) {
    return Promise.all(
      Array.from(this.clients.values()).map((client) =>
        client.endCellExecution(path, cellId, cellOutput)
      )
    );
  }

  async getSession(
    providerId: string,
    scopes: readonly string[],
    options: vscode.AuthenticationGetSessionOptions
  ) {
    // TODO(jaked)
    // it doesn't make sense to call this for all clients
    const sessions = await Promise.all(
      Array.from(this.clients.values()).map((client) =>
        client.getSession(providerId, scopes, options)
      )
    );
    return sessions[0];
  }

  async showInformationMessage(
    message: string,
    options: vscode.MessageOptions,
    ...items: vscode.MessageItem[]
  ) {
    // TODO(jaked)
    // it doesn't make sense to call this for all clients
    const res = await Promise.all(
      Array.from(this.clients.values()).map((client) =>
        client.showInformationMessage(message, options, ...items)
      )
    );
    return res[0];
  }

  async showWarningMessage(
    message: string,
    options: vscode.MessageOptions,
    ...items: vscode.MessageItem[]
  ) {
    // TODO(jaked)
    // it doesn't make sense to call this for all clients
    const res = await Promise.all(
      Array.from(this.clients.values()).map((client) =>
        client.showWarningMessage(message, options, ...items)
      )
    );
    return res[0];
  }

  async showErrorMessage(
    message: string,
    options: vscode.MessageOptions,
    ...items: vscode.MessageItem[]
  ) {
    // TODO(jaked)
    // it doesn't make sense to call this for all clients
    const res = await Promise.all(
      Array.from(this.clients.values()).map((client) =>
        client.showErrorMessage(message, options, ...items)
      )
    );
    return res[0];
  }

  markCellsDirty(cells: { path: string; cellId: string }[]) {
    if (cells.length === 0) {
      return;
    }
    for (const client of this.clients.values()) {
      client.markCellsDirty(cells);
    }
  }

  setupClient(ws: WebSocket, client: Client) {
    const rpc = createBirpc<ClientFunctions, ServerFunctions>(
      {
        ping: async () => {
          console.log("ping");
          return "pong";
        },
        async executeCells(cells, force, executeDirtyCells) {
          try {
            return client.executeCells(cells, force, executeDirtyCells);
          } catch (e) {
            console.error(e);
          }
        },
        async removeCells(cells) {
          try {
            return client.removeCells(cells);
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
}
