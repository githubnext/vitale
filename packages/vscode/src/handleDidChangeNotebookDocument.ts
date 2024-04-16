import type { NotebookDocument, NotebookDocumentChangeEvent } from "vscode";
import { NotebookEdit, WorkspaceEdit, workspace } from "vscode";
import { nanoid } from "nanoid";

function uniqueId(doc: NotebookDocument): string {
  let id = nanoid();
  while (doc.getCells().find((cell) => cell.metadata.id === id)) {
    id = nanoid();
  }
  return id;
}

export function handleDidChangeNotebookDocument(
  e: NotebookDocumentChangeEvent
) {
  const edits: NotebookEdit[] = [];
  for (const contentChange of e.contentChanges) {
    for (const cell of contentChange.addedCells) {
      const id = uniqueId(e.notebook);
      const metadata = { ...(cell.metadata ?? {}), id };
      edits.push(NotebookEdit.updateCellMetadata(cell.index, metadata));
    }
  }
  if (edits.length > 0) {
    const edit = new WorkspaceEdit();
    edit.set(e.notebook.uri, edits);
    workspace.applyEdit(edit);
  }
}
