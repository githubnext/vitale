/// <reference lib="dom" />
import type { ActivationFunction } from "vscode-notebook-renderer";

const cellIdRegex = /^([^?]+\.vnb)\?cellId=([a-zA-z0-9_-]{21})\.([a-z]+)$/;

export const activate: ActivationFunction = (_context) => ({
  async renderOutputItem(outputItem, element) {
    const { id, origin } = outputItem.json();
    const src = `${origin}/${id}?html`;
    if (
      element.firstElementChild &&
      element.firstElementChild.nodeName === "IFRAME" &&
      element.firstElementChild.getAttribute("src") === src
    ) {
      return;
    }

    element.replaceChildren();
    const [_, _path, cellId] = cellIdRegex.exec(id)!;
    const iframe = document.createElement("iframe");
    iframe.style.width = "100%";
    iframe.style.border = "none";
    iframe.src = src;
    // TODO(jaked)
    // clean up listeners
    window.addEventListener("message", (event) => {
      const data = event.data;
      if (data.type === "resize-iframe" && data.cellId === cellId) {
        iframe.style.height = `${data.height}px`;
      }
    });
    element.appendChild(iframe);
  },
});
