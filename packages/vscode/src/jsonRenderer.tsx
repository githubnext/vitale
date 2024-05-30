import type { OutputItem } from "vscode-notebook-renderer";
import JsonView from "@uiw/react-json-view";
import { createRoot } from "react-dom/client";

export const activate = () => ({
  renderOutputItem(data: OutputItem, element: HTMLElement) {
    const root = createRoot(element);
    root.render(
      <JsonView
        collapsed={1}
        displayDataTypes={false}
        displayObjectSize={false}
        value={data.json()}
      />
    );
  },
});
