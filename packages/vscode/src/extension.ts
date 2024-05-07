import * as vscode from "vscode";
import { ViewColumn } from "vscode";
import { NotebookSerializer } from "./serializer";
import { NotebookController } from "./controller";
import { NotebookCellStatusBarItemProvider } from "./cellStatusBarItemProvider";
import { makeHandleDidChangeNotebookDocument } from "./handleDidChangeNotebookDocument";
import { makeHandleDidChangeNotebookEditorSelection } from "./handleDidChangeNotebookEditorSelection";
import { handleDidChangeTextDocument } from "./handleDidChangeTextDocument";

export function activate(context: vscode.ExtensionContext) {
  const controller = new NotebookController(
    vscode.workspace.workspaceFolders?.[0].uri.fsPath
  );

  context.subscriptions.push(
    vscode.commands.registerCommand("vitale.restartKernel", () => {
      controller.restartKernel();
    }),
    vscode.commands.registerCommand(
      "vitale.runDirty",
      (ctx: { notebookEditor: { notebookUri: string } }) => {
        controller.runDirty(ctx.notebookEditor.notebookUri);
      }
    ),
    vscode.commands.registerCommand("vitale.openREPL", async () => {
      await vscode.commands.executeCommand(
        "interactive.open",
        { viewColumn: ViewColumn.Active, preserveFocus: false },
        undefined,
        NotebookController.id + "-repl",
        "Vitale REPL"
      );
      await vscode.commands.executeCommand("notebook.selectKernel", {
        id: NotebookController.id + "-repl",
        extension: "githubnext.vitale-vscode",
      });
    }),
    vscode.commands.registerCommand("vitale.copyToClipboard", (s: string) => {
      vscode.env.clipboard.writeText(s);
    }),
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
    controller,
    vscode.notebooks.registerNotebookCellStatusBarItemProvider(
      "vitale-notebook",
      new NotebookCellStatusBarItemProvider()
    )
  );
}

export function deactivate() {}
