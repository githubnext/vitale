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
  endCellExecution: (
    path: string,
    cellId: string,
    cellOutput: CellOutput
  ) => void;
};
