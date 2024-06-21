import { Cell } from "./types";

export const cellIdRegex =
  /^([^?]+\.vnb)-cellId=([a-zA-z0-9_-]{21})\.([a-z]+)$/;

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

export class Cells {
  private cellsByPath: Map<string, Map<string, Cell>> = new Map();

  get(id: string) {
    const match = cellIdRegex.exec(id);
    if (match) {
      const [_, path, cellId, ext] = match;
      const cells = this.cellsByPath.get(path);
      if (cells) {
        const cell = cells.get(cellId);
        if (cell && extOfLanguage(cell.language) === ext) {
          return cell;
        }
      }
    }
    return null;
  }

  set(id: string, cell: Cell) {
    const match = cellIdRegex.exec(id);
    if (match) {
      const [_, path, cellId] = match;
      let cells = this.cellsByPath.get(path);
      if (!cells) {
        cells = new Map();
        this.cellsByPath.set(path, cells);
      }
      cells.set(cellId, cell);
    }
  }

  delete(id: string) {
    const match = cellIdRegex.exec(id);
    if (match) {
      const [_, path, cellId] = match;
      const cells = this.cellsByPath.get(path);
      if (cells) {
        cells.delete(cellId);
      }
    }
  }

  forPath(path: string) {
    return this.cellsByPath.get(path) ?? new Map();
  }
}
