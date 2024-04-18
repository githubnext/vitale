import * as vscode from "vscode";
import { NotebookSerializer } from "./serializer";
import { NotebookController } from "./controller";
import { NotebookCellStatusBarItemProvider } from "./cellStatusBarItemProvider";
import { handleDidChangeNotebookDocument } from "./handleDidChangeNotebookDocument";

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
    vscode.commands.registerCommand("vitale.copyToClipboard", (s: string) => {
      vscode.env.clipboard.writeText(s);
    }),
    vscode.workspace.registerNotebookSerializer(
      "vitale-notebook",
      new NotebookSerializer(),
      { transientOutputs: true }
    ),
    vscode.workspace.onDidChangeNotebookDocument(
      handleDidChangeNotebookDocument
    ),
    controller,
    vscode.notebooks.registerNotebookCellStatusBarItemProvider(
      "vitale-notebook",
      new NotebookCellStatusBarItemProvider()
    )
  );
}

export function deactivate() {}
