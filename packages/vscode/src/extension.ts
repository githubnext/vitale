import * as vscode from "vscode";
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
    vscode.commands.registerCommand("vitale.copyToClipboard", (s: string) => {
      vscode.env.clipboard.writeText(s);
    }),
    vscode.commands.registerCommand(
      "vitale.pauseCell",
      async (notebookUri: vscode.Uri, cellId: string) => {
        const notebook = await vscode.workspace.openNotebookDocument(
          notebookUri
        );
        const cell = notebook
          .getCells()
          .find((cell) => cell.metadata.id === cellId);
        if (!cell) {
          return false;
        }

        const paused = !cell.metadata.paused;
        const metadata = { ...cell.metadata, paused };
        const edit = new vscode.WorkspaceEdit();
        edit.set(notebookUri, [
          vscode.NotebookEdit.updateCellMetadata(cell.index, metadata),
        ]);
        return vscode.workspace.applyEdit(edit);
      }
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
    controller,
    vscode.notebooks.registerNotebookCellStatusBarItemProvider(
      "vitale-notebook",
      new NotebookCellStatusBarItemProvider()
    )
  );
}

export function deactivate() {}
