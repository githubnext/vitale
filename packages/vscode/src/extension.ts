import * as vscode from "vscode";
import { NotebookCellStatusBarItemProvider } from "./cellStatusBarItemProvider";
import { NotebookController } from "./controller";
import { makeHandleDidChangeNotebookDocument } from "./handleDidChangeNotebookDocument";
import { makeHandleDidChangeNotebookEditorSelection } from "./handleDidChangeNotebookEditorSelection";
import { handleDidChangeTextDocument } from "./handleDidChangeTextDocument";
import { pauseCell } from "./pauseCell";
import { showCellOutputChannel } from "./showCellOutputChannel";
import { NotebookSerializer } from "./serializer";
import { CellOutputPanes } from "./cellOutputPanes";

export function activate(context: vscode.ExtensionContext) {
  const cellOutputPanes = new CellOutputPanes(context.extensionUri);

  const controller = new NotebookController(
    vscode.workspace.workspaceFolders?.[0].uri.fsPath,
    cellOutputPanes
  );

  context.subscriptions.push(
    controller,
    cellOutputPanes,

    vscode.commands.registerCommand("vitale.restartKernel", () => {
      controller.restartKernel();
    }),
    vscode.commands.registerCommand(
      "vitale.runDirty",
      (ctx: { notebookEditor: { notebookUri: string } }) => {
        controller.runDirty(ctx.notebookEditor.notebookUri, true);
      }
    ),
    vscode.commands.registerCommand("vitale.copyToClipboard", (s: string) => {
      vscode.env.clipboard.writeText(s);
    }),
    vscode.commands.registerCommand("vitale.pauseCell", pauseCell),
    vscode.commands.registerCommand(
      "vitale.showCellOutputChannel",
      showCellOutputChannel
    ),
    vscode.commands.registerCommand(
      "vitale.viewCellOutputInPane",
      cellOutputPanes.makeViewCellOutputInPane()
    ),
    vscode.workspace.registerNotebookSerializer(
      "vitale-notebook",
      new NotebookSerializer(),
      { transientOutputs: true }
    ),
    vscode.workspace.onDidChangeNotebookDocument(
      makeHandleDidChangeNotebookDocument(controller)
    ),
    vscode.workspace.onDidChangeTextDocument(handleDidChangeTextDocument),
    vscode.window.onDidChangeNotebookEditorSelection(
      makeHandleDidChangeNotebookEditorSelection(controller)
    ),
    vscode.notebooks.registerNotebookCellStatusBarItemProvider(
      "vitale-notebook",
      new NotebookCellStatusBarItemProvider()
    )
  );
}

export function deactivate() {}
