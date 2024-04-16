import * as vscode from "vscode";
import JSON5 from "json5";

interface NotebookCellMetadata {
  id: string;
  dirty: boolean;
}

interface NotebookCell {
  language: string;
  value: string;
  kind: vscode.NotebookCellKind;
  metadata: NotebookCellMetadata;
  editable?: boolean;
}

interface NotebookData {
  cells: NotebookCell[];
}

export class NotebookSerializer implements vscode.NotebookSerializer {
  public readonly label: string = "Vitale Notebook Serializer";

  constructor() {}

  public async deserializeNotebook(
    data: Uint8Array,
    _token: vscode.CancellationToken
  ): Promise<vscode.NotebookData> {
    const contents = new TextDecoder().decode(data);

    // Read file contents
    let raw: NotebookData;
    try {
      raw = <NotebookData>JSON5.parse(contents);
    } catch {
      raw = { cells: [] };
    }

    const cells = raw.cells.map((item) => {
      const cellData = new vscode.NotebookCellData(
        item.kind,
        item.value,
        item.language
      );
      cellData.metadata = { ...item.metadata, dirty: true };
      return cellData;
    });

    return new vscode.NotebookData(cells);
  }

  public async serializeNotebook(
    data: vscode.NotebookData,
    _token: vscode.CancellationToken
  ): Promise<Uint8Array> {
    const contents: NotebookData = { cells: [] };

    for (const cell of data.cells) {
      contents.cells.push({
        kind: cell.kind,
        language: cell.languageId,
        value: cell.value,
        metadata: cell.metadata as NotebookCellMetadata,
      });
    }

    return new TextEncoder().encode(JSON5.stringify(contents));
  }
}
