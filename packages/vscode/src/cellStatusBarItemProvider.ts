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

    // TODO(jaked)
    // provideCellStatusBarItems is called on cell edits
    // but the cell.document.dirty flag is always false
    if (cell.metadata.dirty || cell.document.isDirty) {
      const dirtyItem = new vscode.NotebookCellStatusBarItem(
        "$(circle-filled)",
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
