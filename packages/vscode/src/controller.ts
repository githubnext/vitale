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
import { log } from "./log";
import { CellOutputPanes } from "./cellOutputPanes";
import { platform } from 'os';

const isWindows = platform() === 'win32';
const isLinux = platform() === 'linux';


function cellOutputToNotebookCellOutput(cellOutput: CellOutput) {
  return new vscode.NotebookCellOutput(
    cellOutput.items.map((item) => {
      const data = new Uint8Array(item.data);
      return new vscode.NotebookCellOutputItem(data, item.mime);
    })
  );
}

export function getRerunCellsWhenDirty() {
  const config = vscode.workspace.getConfiguration("vitale");
  return config.get("rerunCellsWhenDirty", true);
}

type Client = BirpcReturn<ServerFunctions, ClientFunctions>;

type State =
  | "need-port"
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

  private _state: State = "need-port";
  private _tries: number = RECONNECT_TRIES;
  private _port: undefined | number;
  private _process: undefined | ChildProcess;
  private _websocket: undefined | WebSocket;
  private _timeout: undefined | NodeJS.Timeout;
  private _client: undefined | Client;
  private _clientWaiters: {
    resolve: (client: Client) => void;
    reject: (error: Error) => void;
  }[] = [];

  private _executions = new Map<string, vscode.NotebookCellExecution>();

  constructor(
    private _cwd: undefined | string,
    private cellOutputPanes: CellOutputPanes
  ) {
    this._controller = vscode.notebooks.createNotebookController(
      this.id,
      "vitale-notebook",
      this.label
    );

    this._controller.supportedLanguages = this.supportedLanguages;
    this._controller.supportsExecutionOrder = true;
    this._controller.executeHandler = this.executeHandler.bind(this);

    getPort({ port: 51205 }).then((port) => {
      this._port = port;
      this.run("idle");
    });
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
    let command: string;
    if (isWindows) {
      command = 'node_modules/.bin/vitale.cmd';
    } else if (isLinux) {
      command = 'node_modules/.bin/vitale';
    } else {
      command = 'node_modules/.bin/vitale.ps1';
    }
    
    const process = spawn(
      command,
      ["--port", String(this._port)],
      {
        cwd: this._cwd,
        shell: true, // Ensure the correct script is invoked
        // env: {
        //   ...process.env,
        //   DEBUG: "vite:*",
        // },
      }
    );

    process.stdout?.on("data", (data) => {
      log.info(data.toString());
    });
    process.stderr?.on("data", (data) => {
      log.error(data.toString());
    });
    process.on("spawn", () => {
      log.info(`vitale process spawned`);
      this._process = process;
      this.run("started");
    });
    process.on("exit", () => {
      log.info(`vitale process exited`);
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
        outputStdout: this.outputStdout.bind(this),
        outputStderr: this.outputStderr.bind(this),
        updateCellOutput: this.updateCellOutput.bind(this),
        endCellExecution: this.endCellExecution.bind(this),

        // VS Code API
        getSession: vscode.authentication.getSession,
        showInformationMessage: vscode.window.showInformationMessage,
        showWarningMessage: vscode.window.showWarningMessage,
        showErrorMessage: vscode.window.showErrorMessage,
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
      log.info(`ws open`);
      this._websocket = ws;
      this.run("connected");
    });

    ws.on("error", (err) => {
      if (this._websocket && this._websocket !== ws) {
        return;
      }
      log.info(`ws error`);
      log.error(err);
    });

    ws.on("close", () => {
      if (this._websocket && this._websocket !== ws) {
        return;
      }
      log.info(`ws close`);
      if (!this._timeout) {
        this._timeout = setTimeout(() => {
          this._timeout = undefined;
          if (this._state === "connecting" || this._state === "connected") {
            this.run("started");
          }
        }, RECONNECT_INTERVAL);
      }
    });
  }

  run(state: State) {
    if (this._state === "disposed") {
      this.rejectClient(new Error("disposed"));
      return;
    }
    if (state === "idle") {
      for (const execution of this._executions.values()) {
        execution.end(undefined, Date.now());
      }
      this._executions.clear();
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

    log.info(`state: ${state}`);
  }

  restartKernel() {
    // TODO(jaked)
    // should clear outputs and dirty all cells
    if (this._process && this._process.pid) {
      kill(this._process.pid);
    }
  }

  async runDirty(notebookUri: string, force: boolean) {
    const notebook = await vscode.workspace.openNotebookDocument(
      vscode.Uri.parse(notebookUri)
    );
    const cells = notebook
      .getCells()
      .filter(
        (cell) =>
          (cell.metadata.dirty || cell.metadata.docDirty) &&
          (!cell.metadata.paused || force)
      );
    this.executeCells(cells, force);
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
    const metadata = { ...cell.metadata, dirty };
    const edit = new vscode.WorkspaceEdit();
    edit.set(cell.notebook.uri, [
      vscode.NotebookEdit.updateCellMetadata(cell.index, metadata),
    ]);
    return vscode.workspace.applyEdit(edit);
  }

  private setCellDocDirty(cell: vscode.NotebookCell, docDirty: boolean) {
    const metadata = { ...cell.metadata, docDirty };
    const edit = new vscode.WorkspaceEdit();
    edit.set(cell.notebook.uri, [
      vscode.NotebookEdit.updateCellMetadata(cell.index, metadata),
    ]);
    return vscode.workspace.applyEdit(edit);
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

    await Promise.all(
      notebookCells.map((cell) => this.setCellDirty(cell, true))
    );
    if (getRerunCellsWhenDirty()) {
      // don't force paused cells, user didn't request execution
      this.executeCells(notebookCells, false);
    }
  }

  private async startCellExecution(path: string, id: string, force: boolean) {
    const notebook = await vscode.workspace.openNotebookDocument(
      vscode.Uri.file(path)
    );
    const cell = notebook.getCells().find((cell) => cell.metadata.id === id);

    if (!cell || (cell.metadata.paused && !force)) {
      return false;
    }

    const key = `${path}-${id}`;
    if (this._executions.has(key)) {
      // this can happen when the user edits the cell
      // thens executes it
      // because handleDidChangeNotebookEditorSelection fires
      // and calls runDirty
      log.info(`already executing ${key}`);
      return false;
    }

    const execution = this._controller.createNotebookCellExecution(cell);
    execution.token.onCancellationRequested(() => {
      this.cancelCellExecution(path, id);
    });

    execution.executionOrder = ++this._executionOrder;
    execution.start(Date.now());

    this._executions.set(key, execution);
    await execution.clearOutput();
    return true;
  }

  private outputStdout(path: string, cellId: string, output: string) {
    const name = `${path}-${cellId}-stdout`;
    const channel = vscode.window.createOutputChannel(name, { log: true });
    channel.append(output);
  }

  private outputStderr(path: string, cellId: string, output: string) {
    const name = `${path}-${cellId}-stderr`;
    const channel = vscode.window.createOutputChannel(name, { log: true });
    channel.append(output);
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

  private async updateCellOutput(
    path: string,
    id: string,
    cellOutput: CellOutput
  ) {
    const key = `${path}-${id}`;
    const execution = this._executions.get(key);
    if (execution) {
      const notebookCellOutput = cellOutputToNotebookCellOutput(cellOutput);
      await execution.replaceOutput(notebookCellOutput);
      this.cellOutputPanes.updatePane(execution.cell);
    }
  }

  private async endCellExecution(
    path: string,
    id: string,
    cellOutput?: CellOutput
  ) {
    const key = `${path}-${id}`;
    const execution = this._executions.get(key);
    if (execution) {
      if (cellOutput) {
        const notebookCellOutput = cellOutputToNotebookCellOutput(cellOutput);
        await execution.clearOutput();
        await execution.appendOutput(notebookCellOutput);
        this.cellOutputPanes.updatePane(execution.cell);
      }
      execution.end(true, Date.now());
      this._executions.delete(key);
      this.setCellDirty(execution.cell, false);
    }
  }

  private executeHandler(notebookCells: vscode.NotebookCell[]) {
    // force paused cells, user explictly requested execution
    this.executeCells(notebookCells, true);
  }

  private async executeCells(
    notebookCells: vscode.NotebookCell[],
    force: boolean = false
  ) {
    if (notebookCells.length === 0) {
      return;
    }
    await Promise.all(
      notebookCells.map((cell) => this.setCellDocDirty(cell, false))
    );

    const cells = notebookCells
      .filter((cell) => !cell.metadata.paused || force)
      .map((cell) => ({
        path: cell.notebook.uri.fsPath,
        cellId: cell.metadata.id,
        language: cell.document.languageId,
        code: cell.document.getText(),
      }));

    const client = await this.getClient();
    client.executeCells(cells, force, getRerunCellsWhenDirty());
  }

  async removeCells(notebookCells: vscode.NotebookCell[]) {
    if (notebookCells.length === 0) {
      return;
    }

    for (const cell of notebookCells) {
      this.cellOutputPanes.deletePane(cell);
    }

    const cells = notebookCells.map((cell) => ({
      path: cell.notebook.uri.fsPath,
      cellId: cell.metadata.id,
      language: cell.document.languageId,
    }));

    const client = await this.getClient();
    client.removeCells(cells);
  }
}
