/// <reference lib="dom" />
import type { ActivationFunction } from "vscode-notebook-renderer";

const cellIdRegex = /^([^?]+\.vnb)\?cellId=([a-zA-z0-9_-]{21})\.([a-z]+)$/;

export const activate: ActivationFunction = (_context) => ({
  async renderOutputItem(outputItem, element) {
    element.replaceChildren();

    const { id, origin } = outputItem.json();
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

    // Nota bene:
    // 1. script.appendChild(document.createTextNode(...)) not script.innerText = ...
    //    or else the browser parses the script weirdly (comments kill script!)
    // 2. assign base.href to dev server because extension env has special base
    //    (but we should handle this differently, maybe rewrite relative links)
    // 3. VS Code does some shenanigans with the container height,
    //    and if rendering happens at the wrong time the container gets 0 height
    //    so we wait before importing the cell code
    //    (there is probably a better way to fix this)
    script.appendChild(
      document.createTextNode(`
import RefreshRuntime from "${origin}/@react-refresh";
RefreshRuntime.injectIntoGlobalHook(window);
window.$RefreshReg$ = () => {};
window.$RefreshSig$ = () => (type) => type;
window.__vite_plugin_react_preamble_installed__ = true;

await new Promise((resolve) => setTimeout(resolve, 50));

import("${origin}/${id}&t=${Date.now()}");
`)
    );
    element.appendChild(script);
  },
});
