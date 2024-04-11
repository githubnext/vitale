/// <reference lib="dom" />
import type { ActivationFunction } from "vscode-notebook-renderer";

const cellIdRegex = /^([^?]+\.vnb)\?cellId=([a-zA-z0-9_-]{21})\.([a-z]+)$/;

export const activate: ActivationFunction = (_context) => ({
  async renderOutputItem(outputItem, element) {
    element.replaceChildren();

    const { id } = outputItem.json();
    const match = cellIdRegex.exec(id);
    if (!match) {
      element.textContent = "Error: invalid cellId";
      return;
    }

    const [_, _path, cellId] = match;

    const root = document.createElement("div");
    root.id = `cell-output-root-${cellId}`;
    element.appendChild(root);

    const script = document.createElement("script");
    script.type = "module";
    script.innerText = `
import RefreshRuntime from "http://localhost:5173/@react-refresh";
RefreshRuntime.injectIntoGlobalHook(window);
window.$RefreshReg$ = () => {};
window.$RefreshSig$ = () => (type) => type;
window.__vite_plugin_react_preamble_installed__ = true;

document.getElementsByTagName("base")[0].href = "http://localhost:5173/";

// without this delay, sometimes the output cell height is set to 0
await new Promise((resolve) => setTimeout(resolve, 50));

import("http://localhost:5173/${id}&t=${Date.now()}");
`;
    element.appendChild(script);
  },
});
