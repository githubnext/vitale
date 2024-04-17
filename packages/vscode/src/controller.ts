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
import getPort from "get-port";

function cellOutputToNotebookCellOutput(cellOutput: CellOutput) {
  return new vscode.NotebookCellOutput(
    cellOutput.items.map((item) => {
      const data = new Uint8Array(item.data);
      return new vscode.NotebookCellOutputItem(data, item.mime);
    })
  );
}

function getRerunCellsWhenDirty() {
  const config = vscode.workspace.getConfiguration("vitale");
  return config.get("rerunCellsWhenDirty", true);
}

type Client = BirpcReturn<ServerFunctions, ClientFunctions>;

type State =
  | "idle"
  | "starting"
  | "start-failed"
  | "started"
  | "connecting"
  | "connect-failed"
  | "connected"
  | "disposed";

const RECONNECT_TRIES = 10;
const RECONNECT_INTERVAL = 1000;

export class NotebookController {
  readonly id = "vitale-notebook-kernel";
  public readonly label = "Vitale Notebook Kernel";
  readonly supportedLanguages = [
    "typescriptreact",
    "typescript",
    "javascriptreact",
    "javascript",
  ];

  private _executionOrder = 0;
  private readonly _controller: vscode.NotebookController;

  private _state: State = "idle";
  private _tries: number = RECONNECT_TRIES;
  private _port: undefined | number;
  private _process: undefined | ChildProcess;
  private _websocket: undefined | WebSocket;
  private _client: undefined | Client;
  private _clientWaiters: {
    resolve: (client: Client) => void;
    reject: (error: Error) => void;
  }[] = [];

  private _executions = new Map<string, vscode.NotebookCellExecution>();

  constructor(private _cwd: undefined | string) {
    this._controller = vscode.notebooks.createNotebookController(
      this.id,
      "vitale-notebook",
      this.label
    );

    this._controller.supportedLanguages = this.supportedLanguages;
    this._controller.supportsExecutionOrder = true;
    this._controller.executeHandler = this.executeCells.bind(this);

    this.run("idle");
  }

  private resolveClient(client: Client) {
    this._clientWaiters.forEach((waiter) => waiter.resolve(client));
    this._clientWaiters = [];
  }

  private rejectClient(error: Error) {
    this._clientWaiters.forEach((waiter) => waiter.reject(error));
    this._clientWaiters = [];
  }

  private async start() {
    const port = await getPort({ port: 51205 });
    const process = spawn(
      "node_modules/.bin/vitale",
      ["--port", String(port)],
      {
        cwd: this._cwd,
        // env: {
        //   ...process.env,
        //   DEBUG: "vite:*",
        // },
      }
    );
    process.stdout?.on("data", (data) => {
      console.log(data.toString());
    });
    process.stderr?.on("data", (data) => {
      console.error(data.toString());
    });
    process.on("spawn", () => {
      console.log(`vitale process spawned`);
      this._process = process;
      this._port = port;
      this.run("started");
    });
    process.on("exit", () => {
      console.log(`vitale process exited`);
      this.run("idle");
    });
    process.on("error", (error) => {
      this.rejectClient(error);
      this.run("start-failed");
    });
  }

  private makeClient(ws: WebSocket) {
    return createBirpc<ServerFunctions, ClientFunctions>(
      {
        markCellsDirty: this.markCellsDirty.bind(this),
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
  }

  private connect() {
    const url = `ws://localhost:${this._port}/__vitale_api__`;
    const ws = new WebSocket(url);

    ws.on("open", () => {
      if (this._websocket && this._websocket !== ws) {
        ws.close();
        return;
      }
      console.log(`ws open`);
      this._websocket = ws;
      this.run("connected");
    });

    ws.on("error", (err) => {
      if (this._websocket && this._websocket !== ws) {
        return;
      }
      console.log(`ws error`);
      console.error(err);
    });

    ws.on("close", () => {
      if (this._websocket && this._websocket !== ws) {
        return;
      }
      console.log(`ws close`);
      setTimeout(() => {
        if (this._state === "connecting" || this._state === "connected") {
          this.run("started");
        }
      }, RECONNECT_INTERVAL);
    });
  }

  run(state: State) {
    if (this._state === "disposed") {
      this.rejectClient(new Error("disposed"));
      return;
    }
    this._state = state;

    switch (state) {
      case "idle":
        this._process = undefined;
        this._state = "starting";
        this.start();
        break;

      case "start-failed":
        this.rejectClient(new Error(`Couldn't start Vitale server`));
        vscode.window.showErrorMessage(
          `Couldn't start Vitale server; is @githubnext/vitale installed?`
        );
        break;

      case "started":
        this._websocket = undefined;
        if (this._tries > 0) {
          this._tries -= 1;
          this._state = "connecting";
          this.connect();
        } else {
          this.run("connect-failed");
        }
        break;

      case "connect-failed":
        this.rejectClient(new Error(`Couldn't connect to Vitale server`));
        vscode.window.showErrorMessage(`Couldn't connect to Vitale server`);
        break;

      case "connected":
        this._tries = RECONNECT_TRIES;
        this._client = this.makeClient(this._websocket!);
        this.resolveClient(this._client);
        break;

      default:
        throw new Error(`unexpected state: ${state}`);
    }

    console.log(`state: ${state}`);
  }

  restartKernel() {
    // TODO(jaked)
    // should clear outputs and dirty all cells
    if (this._process && this._process.pid) {
      kill(this._process.pid);
    }
  }

  async runDirty(notebookUri: string) {
    const notebook = await vscode.workspace.openNotebookDocument(
      vscode.Uri.parse(notebookUri)
    );
    const cells = notebook.getCells().filter((cell) => cell.metadata.dirty);
    this.executeCells(cells);
  }

  private makeClientPromise() {
    return new Promise<Client>((resolve, reject) => {
      this._clientWaiters.push({ resolve, reject });
    });
  }

  private getClient(): Promise<Client> {
    switch (this._state) {
      case "connected":
        return Promise.resolve(this._client!);

      case "disposed":
        return Promise.reject(new Error("disposed"));

      case "start-failed": {
        const p = this.makeClientPromise();
        this._tries = RECONNECT_TRIES;
        this.run("idle");
        return p;
      }

      case "connect-failed": {
        const p = this.makeClientPromise();
        this._tries = RECONNECT_TRIES;
        this.run("started");
        return p;
      }

      default: {
        return this.makeClientPromise();
      }
    }
  }

  dispose(): void {
    this._state = "disposed";
    if (this._process && this._process.pid) {
      kill(this._process.pid);
    }
    this._controller.dispose();
  }

  private setCellDirty(cell: vscode.NotebookCell, dirty: boolean) {
    const metadata = { ...(cell.metadata ?? {}), dirty };
    const edit = new vscode.WorkspaceEdit();
    edit.set(cell.notebook.uri, [
      vscode.NotebookEdit.updateCellMetadata(cell.index, metadata),
    ]);
    vscode.workspace.applyEdit(edit);
  }

  private async markCellsDirty(cells: { path: string; cellId: string }[]) {
    const notebookCells: vscode.NotebookCell[] = [];

    for (const { path, cellId } of cells) {
      const uri = vscode.Uri.file(path);
      const notebook = await vscode.workspace.openNotebookDocument(uri);
      const cell = notebook
        .getCells()
        .find((cell) => cell.metadata.id === cellId);
      if (cell) {
        notebookCells.push(cell);
      }
    }

    for (const cell of notebookCells) {
      this.setCellDirty(cell, true);
    }
    if (getRerunCellsWhenDirty()) {
      this.executeCells(notebookCells);
    }
  }

  private async startCellExecution(path: string, id: string) {
    console.log(`client startCellExecution`, path, id);
    const notebook = await vscode.workspace.openNotebookDocument(
      vscode.Uri.file(path)
    );
    const cell = notebook.getCells().find((cell) => cell.metadata.id === id);
    if (cell) {
      const execution = this._controller.createNotebookCellExecution(cell);
      execution.token.onCancellationRequested(() => {
        this.cancelCellExecution(path, id);
      });

      execution.executionOrder = ++this._executionOrder;
      execution.start(Date.now());

      const key = `${path}-${id}`;
      console.log(`started execution ${key}`);
      this._executions.set(key, execution);
    }
  }

  private cancelCellExecution(path: string, id: string) {
    console.log(`client cancelCellExecution`, path, id);
    // TODO(jaked) notify server to cancel execution
    const key = `${path}-${id}`;
    const execution = this._executions.get(key);
    if (execution) {
      console.log(`canceled execution ${key}`);
      execution.end(true, Date.now());
      this._executions.delete(key);
    }
  }

  private endCellExecution(path: string, id: string, cellOutput: CellOutput) {
    console.log(`client endCellExecution`, path, id, cellOutput);
    const key = `${path}-${id}`;
    const execution = this._executions.get(key);
    if (execution) {
      console.log(`ended execution ${key}`);
      const notebookCellOutput = cellOutputToNotebookCellOutput(cellOutput);
      execution.replaceOutput(notebookCellOutput);
      execution.end(true, Date.now());
      this._executions.delete(key);

      this.setCellDirty(execution.cell, false);
    }
  }

  private async executeCells(notebookCells: vscode.NotebookCell[]) {
    const cells = notebookCells.map((cell) => ({
      path: cell.notebook.uri.fsPath,
      cellId: cell.metadata.id,
      language: cell.document.languageId,
      code: cell.document.getText(),
    }));

    const client = await this.getClient();
    client.executeCells(cells);
  }
}
