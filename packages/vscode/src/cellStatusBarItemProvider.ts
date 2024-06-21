import * as vscode from "vscode";

export class NotebookCellStatusBarItemProvider
  implements vscode.NotebookCellStatusBarItemProvider
{
  provideCellStatusBarItems(cell: vscode.NotebookCell) {
    const items: vscode.NotebookCellStatusBarItem[] = [];

    if (false) {
      const idItem = new vscode.NotebookCellStatusBarItem(
        cell.metadata.id,
        vscode.NotebookCellStatusBarAlignment.Right
      );
      idItem.command = {
        title: "Copy to clipboard",
        command: "vitale.copyToClipboard",
        arguments: [cell.metadata.id],
      };
      items.push(idItem);
    }

    if (cell.metadata.dirty || cell.metadata.docDirty) {
      const dirtyItem = new vscode.NotebookCellStatusBarItem(
        cell.metadata.docDirty ? "$(circle-filled)" : "$(circle-outline)",
        vscode.NotebookCellStatusBarAlignment.Right
      );
      // TODO(jaked)
      // should disable this while the cell is executing
      dirtyItem.command = "notebook.cell.execute";
      items.push(dirtyItem);
    }

    const pauseItem = new vscode.NotebookCellStatusBarItem(
      cell.metadata.paused ? "$(debug-start)" : "$(debug-pause)",
      vscode.NotebookCellStatusBarAlignment.Right
    );
    pauseItem.tooltip = cell.metadata.paused ? "Unpause" : "Pause";
    pauseItem.command = {
      title: "Pause",
      command: "vitale.pauseCell",
      arguments: [cell],
    };
    items.push(pauseItem);

    // TODO(jaked)
    // it would be nice to show this only if there is any output
    const stdoutItem = new vscode.NotebookCellStatusBarItem(
      "$(output)",
      vscode.NotebookCellStatusBarAlignment.Right
    );
    stdoutItem.tooltip = "Stdout";
    stdoutItem.command = {
      title: "Show stdout",
      command: "vitale.showStdout",
      arguments: [cell],
    };
    items.push(stdoutItem);

    return items;
  }
}
