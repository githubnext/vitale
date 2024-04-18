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
};

export type Options = {
  port: number;
};
