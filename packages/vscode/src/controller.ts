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
    this._controller.executeHandler = this._executeAll.bind(this);

    this.run("idle");
  }

  private resolve(client: Client) {
    this._clientWaiters.forEach((waiter) => waiter.resolve(client));
    this._clientWaiters = [];
  }

  private reject(error: Error) {
    this._clientWaiters.forEach((waiter) => waiter.reject(error));
    this._clientWaiters = [];
  }

  private start() {
    const process = spawn("node_modules/.bin/vitale", {
      cwd: this._cwd,
      // env: {
      //   ...process.env,
      //   DEBUG: "vite:*",
      // },
    });
    process.stdout?.on("data", (data) => {
      console.log(data.toString());
    });
    process.stderr?.on("data", (data) => {
      console.error(data.toString());
    });
    process.on("spawn", () => {
      console.log(`vitale process spawned`);
      this._process = process;
      this.run("started");
    });
    process.on("exit", () => {
      console.log(`vitale process exited`);
      this.run("idle");
    });
    process.on("error", (error) => {
      this.reject(error);
      this.run("start-failed");
    });
  }

  private makeClient(ws: WebSocket) {
    return createBirpc<ServerFunctions, ClientFunctions>(
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
  }

  private connect() {
    const url = `ws://localhost:5173/__vitale_api__`;
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
      this.reject(new Error("disposed"));
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
        this.reject(new Error(`Couldn't start Vitale server`));
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
        this.reject(new Error(`Couldn't connect to Vitale server`));
        vscode.window.showErrorMessage(`Couldn't connect to Vitale server`);
        break;

      case "connected":
        this._tries = RECONNECT_TRIES;
        this._client = this.makeClient(this._websocket!);
        this.resolve(this._client);
        break;

      default:
        throw new Error(`unexpected state: ${state}`);
    }

    console.log(`state: ${state}`);
  }

  restartKernel() {
    if (this._process && this._process.pid) {
      kill(this._process.pid);
    }
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

  private async startCellExecution(path: string, id: string) {
    console.log(`client startCellExecution`, path, id);
    const document = await vscode.workspace.openNotebookDocument(
      vscode.Uri.file(path)
    );
    const cell = document.getCells().find((cell) => cell.metadata.id === id);
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
    try {
      const client = await this.getClient();

      client.executeCell(
        path,
        cell.metadata.id,
        cell.document.languageId,
        cell.document.getText()
      );
    } catch (e) {
      console.error(e);
    }
  }
}
