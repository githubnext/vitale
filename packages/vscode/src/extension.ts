import * as vscode from "vscode";
import { NotebookSerializer } from "./serializer";
import { NotebookController } from "./controller";
import { handleDidChangeNotebookDocument } from "./handleDidChangeNotebookDocument";

export function activate(context: vscode.ExtensionContext) {
  const controller = new NotebookController(
    vscode.workspace.workspaceFolders?.[0].uri.fsPath
  );

  context.subscriptions.push(
    vscode.commands.registerCommand("vitale.restartKernel", () => {
      controller.restartKernel();
    }),
    vscode.workspace.registerNotebookSerializer(
      "vitale-notebook",
      new NotebookSerializer(),
      { transientOutputs: true }
    ),
    vscode.workspace.onDidChangeNotebookDocument(
      handleDidChangeNotebookDocument
    ),
    controller
  );
}

export function deactivate() {}
