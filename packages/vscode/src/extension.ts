import * as vscode from "vscode";
import { NotebookSerializer } from "./serializer";
import { NotebookController } from "./controller";
import { handleDidChangeNotebookDocument } from "./handleDidChangeNotebookDocument";

export function activate(context: vscode.ExtensionContext) {
  context.subscriptions.push(
    vscode.commands.registerCommand("vitale.helloWorld", () => {
      vscode.window.showInformationMessage("Hello World from Vitale!");
    }),
    vscode.workspace.registerNotebookSerializer(
      "vitale-notebook",
      new NotebookSerializer(),
      { transientOutputs: true }
    ),
    new NotebookController(vscode.workspace.workspaceFolders?.[0].uri.fsPath),
    vscode.workspace.onDidChangeNotebookDocument(
      handleDidChangeNotebookDocument
    )
  );
}

export function deactivate() {}
