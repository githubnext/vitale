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
