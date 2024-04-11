/// <reference lib="dom" />
import type { ActivationFunction } from "vscode-notebook-renderer";

const cellIdRegex = /^([^?]+\.vnb)\?cellId=([a-zA-z0-9_-]{21})\.([a-z]+)$/;

namespace window {
  export let $RefreshReg$: () => void;
  export let $RefreshSig$: () => (type: any) => any;
  export let __vite_plugin_react_preamble_installed__: boolean;
}

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

    const RefreshRuntime = await import(`http://localhost:5173/@react-refresh`);
    RefreshRuntime.default.injectIntoGlobalHook(window);
    window.$RefreshReg$ = () => {};
    window.$RefreshSig$ = () => (type) => type;
    window.__vite_plugin_react_preamble_installed__ = true;

    await import(`http://localhost:5173/${id}&t=${Date.now()}`);
  },
});
