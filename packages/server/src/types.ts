import * as babelTypes from "@babel/types";

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
      code: string;
    }[]
  ) => void;
};

export type ClientFunctions = {
  markCellsDirty: (cells: { path: string; cellId: string }[]) => void;
  startCellExecution: (path: string, cellId: string) => void;
  endCellExecution: (
    path: string,
    cellId: string,
    cellOutput: CellOutput
  ) => void;
};

export type SourceDescription = {
  code: string;
  ast: babelTypes.File;
  type: "server" | "client";
  autoExports: babelTypes.ImportDeclaration[];
};

export type Cell = {
  cellId: string;
  code: string;
  language: string;
  sourceDescription?: SourceDescription;
};

export type Options = {
  port: number;
};
