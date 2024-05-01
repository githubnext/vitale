import type { NotebookDocument, NotebookDocumentChangeEvent } from "vscode";
import { NotebookCell, NotebookEdit, WorkspaceEdit, workspace } from "vscode";
import type { NotebookController } from "./controller";
import { nanoid } from "nanoid";

function uniqueId(doc: NotebookDocument): string {
  let id = nanoid();
  while (doc.getCells().find((cell) => cell.metadata.id === id)) {
    id = nanoid();
  }
  return id;
}

export function makeHandleDidChangeNotebookDocument(
  controller: NotebookController
) {
  return (e: NotebookDocumentChangeEvent) => {
    const edits: NotebookEdit[] = [];
    const removedCells: NotebookCell[] = [];
    for (const contentChange of e.contentChanges) {
      for (const cell of contentChange.addedCells) {
        const id = uniqueId(e.notebook);
        const metadata = { ...cell.metadata, id };
        edits.push(NotebookEdit.updateCellMetadata(cell.index, metadata));
      }
      removedCells.push(...contentChange.removedCells);
    }
    if (edits.length > 0) {
      const edit = new WorkspaceEdit();
      edit.set(e.notebook.uri, edits);
      workspace.applyEdit(edit);
    }
    if (removedCells.length > 0) {
      controller.removeCells(removedCells);
    }
  };
}
