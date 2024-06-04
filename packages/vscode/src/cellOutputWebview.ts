import type { OutputItem, RendererApi } from "vscode-notebook-renderer";
import { activate as activateJsonRenderer } from "./jsonRenderer";
import { activate as activateVitaleRenderer } from "./vitaleRenderer";
import { activate as activateNotebookRenderers } from "../notebook-renderers/src";
import { activate as activeMarkdownLanguageFeatures } from "../markdown-language-features/notebook";

const rendererContext = {
  workspace: { isTrusted: true },
  settings: {
    lineLimit: 100,
    linkifyFilePaths: false,
    minimalError: false,
    outputScrolling: false,
    outputWordWrap: false,
  },
  onDidChangeSettings: (_cb: any) => ({ dispose: () => {} }),
} as any;

let jsonRenderer: undefined | RendererApi = undefined;
function getJsonRenderer() {
  jsonRenderer ||= activateJsonRenderer();
  return jsonRenderer;
}

let vitaleRenderer: undefined | RendererApi = undefined;
function getVitaleRenderer() {
  vitaleRenderer ||= activateVitaleRenderer();
  return vitaleRenderer;
}

let notebookRenderers: undefined | RendererApi = undefined;
async function getNotebookRenderers() {
  notebookRenderers ||= await activateNotebookRenderers(rendererContext);
  return notebookRenderers;
}

// TODO(jaked)
// this renders code types like text/x-typescript
// but highlighting doesn't work
// because vscode does some special setup when calling notebook renderers
// see src/vs/workbench/contrib/notebook/browser/view/renderers/webviewPreloads.ts
let markdownLanguageFeatures: undefined | RendererApi = undefined;
async function getMarkdownLanguageFeatures() {
  markdownLanguageFeatures ||= await activeMarkdownLanguageFeatures(
    rendererContext
  );
  return markdownLanguageFeatures;
}

const errorRenderer: RendererApi = {
  renderOutputItem(data: OutputItem, element: HTMLElement) {
    element.textContent = `Unsupported MIME type: ${data.mime}`;
  },
};

const api = acquireVsCodeApi();

// these aren't identical to the vscode types
// because Uint8Array gets turned into an object in serialization (?)
type NotebookCellOutputItem = {
  mime: string;
  data: { type: "Buffer"; data: number[] };
};

type NotebookCellOutput = {
  items: NotebookCellOutputItem[];
};

type OutputMessage = {
  type: "output";
  output: NotebookCellOutput;
};

function outputItemOfNotebookCellOutputItem(
  notebookCellOutputItem: NotebookCellOutputItem
): OutputItem {
  // TODO(jaked)
  // find where vscode does this and do it the same way
  return {
    id: "id",
    mime: notebookCellOutputItem.mime,
    text() {
      return new TextDecoder().decode(this.data());
    },
    json() {
      return JSON.parse(this.text());
    },
    data() {
      return Uint8Array.from(notebookCellOutputItem.data.data);
    },
    blob() {
      return new Blob([this.data()], { type: this.mime });
    },
    metadata: undefined,
  };
}

window.addEventListener("message", async (e: MessageEvent<OutputMessage>) => {
  if (!e.data || e.data.type !== "output") {
    return;
  }

  const element = document.getElementById("output");
  if (!element) {
    return;
  }
  element.replaceChildren();

  const output = e.data.output;
  if (!output || output.items.length === 0) {
    return;
  }

  const item = output.items[0];

  let renderer: RendererApi | undefined;
  switch (item.mime) {
    case "application/x-json-view":
      renderer = getJsonRenderer();
      break;

    case "application/x-vitale":
      renderer = getVitaleRenderer();
      break;

    case "image/gif":
    case "image/png":
    case "image/jpeg":
    case "image/git":
    case "image/svg+xml":
    case "text/html":
    case "application/javascript":
    case "application/vnd.code.notebook.error":
    case "application/vnd.code.notebook.stdout":
    case "application/x.notebook.stdout":
    case "application/x.notebook.stream":
    case "application/vnd.code.notebook.stderr":
    case "application/x.notebook.stderr":
    case "text/plain": {
      renderer = await getNotebookRenderers();
      break;
    }

    case "application/json":
    case "text/latex":
    case "text/markdown":
    case "text/x-abap":
    case "text/x-apex":
    case "text/x-azcli":
    case "text/x-bat":
    case "text/x-cameligo":
    case "text/x-clojure":
    case "text/x-coffee":
    case "text/x-cpp":
    case "text/x-csharp":
    case "text/x-csp":
    case "text/x-css":
    case "text/x-dart":
    case "text/x-dockerfile":
    case "text/x-ecl":
    case "text/x-fsharp":
    case "text/x-go":
    case "text/x-graphql":
    case "text/x-handlebars":
    case "text/x-hcl":
    case "text/x-html":
    case "text/x-ini":
    case "text/x-java":
    case "text/x-javascript":
    case "text/x-json":
    case "text/x-julia":
    case "text/x-kotlin":
    case "text/x-less":
    case "text/x-lexon":
    case "text/x-lua":
    case "text/x-m3":
    case "text/x-markdown":
    case "text/x-mips":
    case "text/x-msdax":
    case "text/x-mysql":
    case "text/x-objective-c/objective":
    case "text/x-pascal":
    case "text/x-pascaligo":
    case "text/x-perl":
    case "text/x-pgsql":
    case "text/x-php":
    case "text/x-postiats":
    case "text/x-powerquery":
    case "text/x-powershell":
    case "text/x-pug":
    case "text/x-python":
    case "text/x-r":
    case "text/x-razor":
    case "text/x-redis":
    case "text/x-redshift":
    case "text/x-restructuredtext":
    case "text/x-ruby":
    case "text/x-rust":
    case "text/x-sb":
    case "text/x-scala":
    case "text/x-scheme":
    case "text/x-scss":
    case "text/x-shell":
    case "text/x-solidity":
    case "text/x-sophia":
    case "text/x-sql":
    case "text/x-st":
    case "text/x-swift":
    case "text/x-systemverilog":
    case "text/x-tcl":
    case "text/x-twig":
    case "text/x-typescript":
    case "text/x-vb":
    case "text/x-xml":
    case "text/x-yaml": {
      renderer = await getMarkdownLanguageFeatures();
      break;
    }

    default:
      renderer = errorRenderer;
  }

  const controller = new AbortController();
  renderer?.renderOutputItem(
    outputItemOfNotebookCellOutputItem(item),
    element,
    controller.signal
  );
});

api.postMessage({ type: "loaded" });
