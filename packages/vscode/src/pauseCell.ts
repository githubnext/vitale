import * as vscode from "vscode";

export const pauseCell = async (cell: vscode.NotebookCell) => {
  const paused = !cell.metadata.paused;
  const metadata = { ...cell.metadata, paused };
  const edit = new vscode.WorkspaceEdit();
  edit.set(cell.notebook.uri, [
    vscode.NotebookEdit.updateCellMetadata(cell.index, metadata),
  ]);
  return vscode.workspace.applyEdit(edit);
};
