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
const __vite__cjsImport0_react_jsxDevRuntime = (await import("http://localhost:5173/node_modules/.vite/deps/react_jsx-dev-runtime.js?v=e04bfa81")).default;
const jsxDEV = __vite__cjsImport0_react_jsxDevRuntime["jsxDEV"];
const __vite__cjsImport1_react = (await import("http://localhost:5173/node_modules/.vite/deps/react.js?v=e04bfa81")).default;
const React = __vite__cjsImport1_react.__esModule ? __vite__cjsImport1_react.default : __vite__cjsImport1_react;
const __vite__cjsImport2_reactDom_client = (await import("http://localhost:5173/node_modules/.vite/deps/react-dom_client.js?v=e04bfa81")).default;
const ReactDOM = __vite__cjsImport2_reactDom_client.__esModule ? __vite__cjsImport2_reactDom_client.default : __vite__cjsImport2_reactDom_client;

import RefreshRuntime from "http://localhost:5173/@react-refresh";
RefreshRuntime.injectIntoGlobalHook(window);
window.$RefreshReg$ = () => {};
window.$RefreshSig$ = () => (type) => type;
window.__vite_plugin_react_preamble_installed__ = true;

document.getElementsByTagName("base")[0].href = "http://localhost:5173/";

await new Promise((resolve) => setTimeout(resolve, 50));

const Component = (await import("http://localhost:5173/${id}&t=${Date.now()}")).default;

const root = ReactDOM.createRoot(document.getElementById("${root.id}"));
root.render(jsxDEV(React.StrictMode, { children: Component }, void 0, false));
`)
    );
    element.appendChild(script);
  },
});
