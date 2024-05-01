import * as vscode from "vscode";

export class NotebookCellStatusBarItemProvider
  implements vscode.NotebookCellStatusBarItemProvider
{
  provideCellStatusBarItems(cell: vscode.NotebookCell) {
    const items: vscode.NotebookCellStatusBarItem[] = [];

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
    return items;
  }
}
