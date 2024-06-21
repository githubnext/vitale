import * as vscode from "vscode";

export const showStdout = async (cell: vscode.NotebookCell) => {
  const name = `${cell.notebook.uri.fsPath}-${cell.metadata.id}-stdout`;
  const channel = vscode.window.createOutputChannel(name, { log: true });
  channel.show(/* preserveFocus: */ true);
};
