import * as vscode from "vscode";

export const showCellOutputChannel = async (cell?: vscode.NotebookCell) => {
  if (!cell) {
    return;
  }
  const name = `${cell.notebook.uri.fsPath}-${cell.metadata.id}-stdout`;
  const channel = vscode.window.createOutputChannel(name, { log: true });
  channel.show(/* preserveFocus: */ true);
};
