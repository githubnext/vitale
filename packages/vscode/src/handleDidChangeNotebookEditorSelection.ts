import type { NotebookEditorSelectionChangeEvent } from "vscode";
import { getRerunCellsWhenDirty } from "./controller";
import type { NotebookController } from "./controller";

export function makeHandleDidChangeNotebookEditorSelection(
  controller: NotebookController
) {
  return (e: NotebookEditorSelectionChangeEvent) => {
    // what we really want here is to run when an edited cell loses focus
    // but it doesn't seem to be possible in the VS Code API
    // so instead we run when the notebook selection changes
    // (i.e. you switch to a different cell)
    // but unfortunately this doesn't fire when you click outside any cell
    if (getRerunCellsWhenDirty()) {
      controller.runDirty(e.notebookEditor.notebook.uri.toString());
    }
  };
}
