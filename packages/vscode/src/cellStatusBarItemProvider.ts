import * as vscode from "vscode";

export class NotebookCellStatusBarItemProvider
  implements vscode.NotebookCellStatusBarItemProvider
{
  provideCellStatusBarItems(cell: vscode.NotebookCell) {
    // TODO(jaked)
    // provideCellStatusBarItems is called on cell edits
    // but the cell.document.dirty flag is always false
    if (cell.metadata.dirty || cell.document.isDirty) {
      const item = new vscode.NotebookCellStatusBarItem(
        "$(circle-filled)",
        vscode.NotebookCellStatusBarAlignment.Right
      );
      // TODO(jaked)
      // should disable this while the cell is executing
      item.command = "notebook.cell.execute";
      return item;
    }
    return;
  }
}
