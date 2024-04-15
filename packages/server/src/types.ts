import { Program } from "@babel/types";

export interface CellOutputItem {
  data: number[]; // Uint8Array
  mime: string;
}

export interface CellOutput {
  items: CellOutputItem[];
}

export type ServerFunctions = {
  ping: () => Promise<"pong">;

  executeCell: (
    path: string,
    id: string,
    language: string,
    code: string
  ) => void;
};

export type ClientFunctions = {
  startCellExecution: (path: string, cellId: string) => void;
  endCellExecution: (
    path: string,
    cellId: string,
    cellOutput: CellOutput
  ) => void;
};

export type SourceDescription = {
  code: string;
  ast: Program;
  type: "server" | "client";
};

export type Options = {
  port: number;
};
