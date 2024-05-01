import type { TextDocumentChangeEvent } from "vscode";
import { NotebookEdit, WorkspaceEdit, workspace } from "vscode";

export function handleDidChangeTextDocument(e: TextDocumentChangeEvent) {
  if (e.document.uri.scheme !== "vscode-notebook-cell") {
    return;
  }
  const notebook = workspace.notebookDocuments.find(
    (notebook) => notebook.uri.path === e.document.uri.path
  );
  if (!notebook) {
    return;
  }
  const cell = notebook
    .getCells()
    .find((cell) => cell.document.uri.fragment === e.document.uri.fragment);
  if (!cell) {
    return;
  }

  const metadata = { ...cell.metadata, docDirty: true };
  const edit = new WorkspaceEdit();
  edit.set(notebook.uri, [
    NotebookEdit.updateCellMetadata(cell.index, metadata),
  ]);
  workspace.applyEdit(edit);
}
