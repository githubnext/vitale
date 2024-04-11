/// <reference lib="dom" />
import type { ActivationFunction } from "vscode-notebook-renderer";

const cellIdRegex = /^([^?]+\.vnb)\?cellId=([a-zA-z0-9_-]{21})\.([a-z]+)$/;

export const activate: ActivationFunction = (_context) => ({
  renderOutputItem(outputItem, element) {
    element.replaceChildren();

    const { id, nonce } = outputItem.json();
    console.log(`renderOutputItem`, { id, nonce });
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
    const scriptText = `
import RefreshRuntime from "http://localhost:5173/@react-refresh";
RefreshRuntime.injectIntoGlobalHook(window);
window.$RefreshReg$ = () => {};
window.$RefreshSig$ = () => (type) => type;
window.__vite_plugin_react_preamble_installed__ = true;

const script = document.createElement("script");
script.type = "module";
script.src = "http://localhost:5173/${id}&t=${Date.now()}";
const element = document.getElementById("${element.id}");
element.appendChild(script);
`;

    script.innerText = scriptText;

    element.appendChild(script);
  },
});
