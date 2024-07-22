import { Cells } from "./cells";
import { executeCell } from "./executeCell";
import { Runtime } from "./runtime";
import { Rpc } from "./rpc";

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

export class Client {
  private rpc: Rpc;
  private cells: Cells;
  private runtime: Runtime;

  constructor(rpc: Rpc, cells: Cells, runtime: Runtime) {
    this.rpc = rpc;
    this.cells = cells;
    this.runtime = runtime;
  }

  async executeCells(
    cells: {
      path: string;
      cellId: string;
      language: string;
      code: string;
    }[],
    force: boolean,
    executeDirtyCells: boolean
  ) {
    let dirtyCells: { path: string; cellId: string; ext: string }[] = [];

    for (const { path, cellId, language, code } of cells) {
      const ext = extOfLanguage(language);
      const id = `${path}-cellId=${cellId}.${ext}`;
      this.cells.set(id, { cellId, code, language });

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
          this.rpc,
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
    this.rpc.markCellsDirty(cellsToMarkDirty);
  }

  removeCells(
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
    this.rpc.markCellsDirty(dirtyCells);
  }
}
