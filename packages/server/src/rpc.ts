import { createBirpc, type BirpcReturn } from "birpc";
import JSON5 from "json5";
import type WebSocket from "ws";
import { Cells } from "./cells";
import { executeCell } from "./executeCell";
import type { CellOutput, ClientFunctions, ServerFunctions } from "./rpc-types";
import { Runtime } from "./runtime";

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

export class Rpc {
  private clients: Map<
    WebSocket,
    BirpcReturn<ClientFunctions, ServerFunctions>
  > = new Map();
  private cells: Cells;
  private runtime: Runtime;

  constructor(cells: Cells, runtime: Runtime) {
    this.cells = cells;
    this.runtime = runtime;
  }

  startCellExecution(path: string, cellId: string, force: boolean) {
    return Promise.all(
      Array.from(this.clients.values()).map((client) =>
        client.startCellExecution(path, cellId, force)
      )
    ).then((oks) => oks.every((ok) => ok));
  }

  endCellExecution(path: string, cellId: string, cellOutput: CellOutput) {
    return Promise.all(
      Array.from(this.clients.values()).map((client) =>
        client.endCellExecution(path, cellId, cellOutput)
      )
    );
  }

  markCellsDirty(cells: { path: string; cellId: string }[]) {
    if (cells.length === 0) {
      return;
    }
    for (const client of this.clients.values()) {
      client.markCellsDirty(cells);
    }
  }

  setupClient(ws: WebSocket) {
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
        this.cells.set(id, { cellId, code, language });
      }

      this.runtime.invalidateServerModule(id);
      this.runtime.handleHMRUpdate(id);
      this.runtime.invalidateRuntimeModule(id, dirtyCells);
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
        executeCell(
          this,
          this.cells,
          this.runtime,
          `${path}-cellId=${cellId}.${ext}`,
          path,
          cellId,
          force
        )
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
      this.cells.delete(id);

      this.runtime.invalidateServerModule(id);
      // TODO(jaked) HMR remove?
      this.runtime.invalidateRuntimeModule(id, dirtyCells);
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
}
