import * as vscode from "vscode";

export interface CellOutputItem {
  data: number[]; // Uint8Array
  mime: string;
}

export interface CellOutput {
  items: CellOutputItem[];
}

export type ServerFunctions = {
  ping: () => Promise<"pong">;

  removeCells: (
    cells: {
      path: string;
      cellId: string;
      language: string;
    }[]
  ) => void;

  executeCells: (
    cells: {
      path: string;
      cellId: string;
      language: string;
      code?: string;
    }[],
    force: boolean,
    executeDirtyCells: boolean
  ) => void;
};

export type ClientFunctions = {
  markCellsDirty: (cells: { path: string; cellId: string }[]) => void;
  startCellExecution: (
    path: string,
    cellId: string,
    force: boolean
  ) => Promise<boolean>;
  outputStdout: (path: string, cellId: string, output: string) => void;
  outputStderr: (path: string, cellId: string, output: string) => void;
  updateCellOutput: (
    path: string,
    cellId: string,
    cellOutput: CellOutput
  ) => void;
  endCellExecution: (
    path: string,
    cellId: string,
    cellOutput?: CellOutput
  ) => void;

  // VS Code API
  getSession: typeof vscode.authentication.getSession;
  showInformationMessage: typeof vscode.window.showInformationMessage;
  showWarningMessage: typeof vscode.window.showWarningMessage;
  showErrorMessage: typeof vscode.window.showErrorMessage;
};
