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

    // this event fires when you click on cell status bar items
    // so wait a bit to let the click handler fire (and possibly update metadata)
    // before running dirty cells
    // TODO(jaked) ugh
    setTimeout(() => {
      if (getRerunCellsWhenDirty()) {
        controller.runDirty(e.notebookEditor.notebook.uri.toString(), false);
      }
    }, 100);
  };
}
