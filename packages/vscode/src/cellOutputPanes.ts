import * as vscode from "vscode";

export class CellOutputPanes {
  private panes = new Map<vscode.NotebookCell, vscode.WebviewPanel>();

  constructor(private readonly extensionUri: vscode.Uri) {}

  private getWebviewContent(webview: vscode.Webview) {
    // TODO(jaked) what should this be?
    const csp = [
      `default-src 'none'`,
      `script-src ${webview.cspSource} 'unsafe-eval' http://127.0.0.1:*`,
      `style-src ${webview.cspSource} 'unsafe-inline' http://127.0.0.1:*`,
      "frame-src http://127.0.0.1:*",
      `connect-src http://127.0.0.1:* ws://127.0.0.1:*`,
    ];

    const scriptUri = webview
      .asWebviewUri(
        vscode.Uri.joinPath(this.extensionUri, "dist", "cellOutputWebview.mjs")
      )
      .toString();

    return `<!DOCTYPE html>
  <html lang="en">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <meta http-equiv="Content-Security-Policy" content="${csp.join("; ")}">
        <script src="${scriptUri}"></script>
    </head>
    <body>
      <div id="output" />
    </body>
  </html>`;
  }

  showPane(cell: vscode.NotebookCell) {
    if (this.panes.has(cell)) {
      this.panes.get(cell)?.reveal(vscode.ViewColumn.Beside, true);
    } else {
      const cellUri = cell.document.uri.toString();
      const panel = vscode.window.createWebviewPanel(
        cellUri,
        cellUri,
        { viewColumn: vscode.ViewColumn.Beside, preserveFocus: true },
        { enableScripts: true }
      );

      panel.webview.onDidReceiveMessage((msg) => {
        if (msg.type === "loaded") {
          panel.webview.postMessage({
            type: "output",
            output: cell.outputs[0],
          });
        }
      });

      panel.webview.html = this.getWebviewContent(panel.webview);

      panel.onDidDispose(() => {
        this.panes.delete(cell);
      });

      this.panes.set(cell, panel);
    }
  }

  updatePane(cell: vscode.NotebookCell) {
    const pane = this.panes.get(cell);
    if (pane) {
      pane.webview.postMessage({ type: "output", output: cell.outputs[0] });
    }
  }

  deletePane(cell: vscode.NotebookCell) {
    this.panes.get(cell)?.dispose();
    this.panes.delete(cell);
  }

  dispose() {
    for (const pane of this.panes.values()) {
      pane.dispose();
    }
  }

  makeViewCellOutputInPane() {
    return (cell?: vscode.NotebookCell) => {
      if (cell) {
        this.showPane(cell);
      }
    };
  }
}
