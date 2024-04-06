import * as vscode from "vscode";
import WebSocket from "ws";
import type {
  CellOutput,
  ClientFunctions,
  ServerFunctions,
} from "@githubnext/vitale";
import { type ChildProcess, spawn } from "node:child_process";
import JSON5 from "json5";
import { type BirpcReturn } from "birpc";
import { createBirpc } from "birpc";
import kill from "tree-kill";

function cellOutputToNotebookCellOutput(cellOutput: CellOutput) {
  return new vscode.NotebookCellOutput(
    cellOutput.items.map((item) => {
      const data = new Uint8Array(item.data);
      return new vscode.NotebookCellOutputItem(data, item.mime);
    })
  );
}

type Client = BirpcReturn<ServerFunctions, ClientFunctions>;

export class NotebookController {
  readonly id = "vitale-notebook-kernel";
  public readonly label = "Vitale Notebook Kernel";
  readonly supportedLanguages = [
    "typescriptreact",
    "typescript",
    "javascriptreact",
    "javascript",
  ];

  private _disposed = false;
  private _executionOrder = 0;
  private readonly _controller: vscode.NotebookController;
  private _process: undefined | ChildProcess;
  private _client: undefined | Client;

  private _executions = new Map<string, vscode.NotebookCellExecution>();

  constructor(private _cwd: undefined | string) {
    this._controller = vscode.notebooks.createNotebookController(
      this.id,
      "vitale-notebook",
      this.label
    );

    this._controller.supportedLanguages = this.supportedLanguages;
    this._controller.supportsExecutionOrder = true;
    this._controller.executeHandler = this._executeAll.bind(this);

    this.startProcess().then(() => this.connectClient());
  }

  restartKernel() {
    if (this._process && this._process.pid) {
      kill(this._process.pid);
    }
  }

  startProcess() {
    let resolveSpawnPromise: () => void;
    const spawnPromise = new Promise<void>((resolve) => {
      resolveSpawnPromise = resolve;
    });

    this._process = spawn("node_modules/.bin/vitale", {
      cwd: this._cwd,
      // env: {
      //   ...process.env,
      //   DEBUG: "vite:*",
      // },
    });
    this._process.stdout?.on("data", (data) => {
      console.log(data.toString());
    });
    this._process.stderr?.on("data", (data) => {
      console.error(data.toString());
    });
    this._process.on("spawn", () => {
      console.log(`vitale process spawned`);
      resolveSpawnPromise();
    });
    this._process.on("exit", () => {
      console.log(`vitale process exited`);
      this._process = undefined;
      if (!this._disposed) {
        this.startProcess();
      }
    });
    this._process.on("error", (code) => {
      vscode.window.showErrorMessage(
        `Couldn't start Vitale; is @githubnext/vitale installed?`
      );
      console.log(`failed to start process ${code}`);
    });

    return spawnPromise;
  }

  connectClient(): Promise<Client> {
    let resolveClientPromise: (client: Client) => void;
    const clientPromise = new Promise<Client>((resolve) => {
      resolveClientPromise = resolve;
    });

    const RECONNECT_TRIES = 10;
    const RECONNECT_INTERVAL = 1000;

    let tries = RECONNECT_TRIES;

    const connect = () => {
      const url = `ws://localhost:5173/__vitale_api__`;
      const ws = new WebSocket(url);

      ws.on("open", () => {
        console.log(`ws open`);
        tries = RECONNECT_TRIES;
        const client = createBirpc<ServerFunctions, ClientFunctions>(
          {
            startCellExecution: this.startCellExecution.bind(this),
            endCellExecution: this.endCellExecution.bind(this),
          },
          {
            post: (msg) => ws.send(msg),
            on: (fn) => ws.on("message", fn),
            serialize: JSON5.stringify,
            deserialize: JSON5.parse,
          }
        );
        this._client = client;
        resolveClientPromise(client);
      });

      ws.on("error", (err) => {
        console.error(err);
      });

      ws.on("close", () => {
        console.log(`ws close`);
        this._client = undefined;
        if (tries > 0) {
          tries -= 1;
          setTimeout(connect, RECONNECT_INTERVAL);
        }
      });
    };
    connect();

    return clientPromise;
  }

  getClient(): Promise<Client> {
    if (this._client) {
      return Promise.resolve(this._client);
    } else {
      return this.connectClient();
    }
  }

  dispose(): void {
    this._disposed = true;
    if (this._process && this._process.pid) {
      kill(this._process.pid);
    }
    this._controller.dispose();
  }

  private startCellExecution(path: string, id: string) {
    vscode.workspace
      .openNotebookDocument(vscode.Uri.file(path))
      .then((document) => {
        const cell = document
          .getCells()
          .find((cell) => cell.metadata.id === id);
        if (cell) {
          const execution = this._controller.createNotebookCellExecution(cell);
          execution.token.onCancellationRequested(() => {
            this.cancelCellExecution(path, id);
          });

          execution.executionOrder = ++this._executionOrder;
          execution.start(Date.now());

          this._executions.set(`${path}-${id}`, execution);
        }
      });
  }

  private cancelCellExecution(path: string, id: string) {
    // TODO(jaked) notify server to cancel execution
    const key = `${path}-${id}`;
    const execution = this._executions.get(key);
    if (execution) {
      execution.end(true, Date.now());
      this._executions.delete(key);
    }
  }

  private endCellExecution(path: string, id: string, cellOutput: CellOutput) {
    const key = `${path}-${id}`;
    const execution = this._executions.get(key);
    if (execution) {
      const notebookCellOutput = cellOutputToNotebookCellOutput(cellOutput);
      execution.replaceOutput(notebookCellOutput);
      execution.end(true, Date.now());
      this._executions.delete(key);
    }
  }

  private _executeAll(
    cells: vscode.NotebookCell[],
    _notebook: vscode.NotebookDocument,
    _controller: vscode.NotebookController
  ): void {
    for (const cell of cells) {
      this._doExecution(_notebook.uri.fsPath, cell);
    }
  }

  private async _doExecution(
    path: string,
    cell: vscode.NotebookCell
  ): Promise<void> {
    const client = await this.getClient();

    client.executeCell(
      path,
      cell.metadata.id,
      cell.document.languageId,
      cell.document.getText()
    );
  }
}
