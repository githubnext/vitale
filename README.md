# Vitale

`vitale` is a notebook for Node + TypeScript that uses `vite` for compilation
and hot-reloading.

## Installation

1.  Install the `.vsix` from the latest build:

    - go to https://github.com/githubnext/vitale/actions/workflows/vsix.yml
    - click on the latest run
    - scroll to the bottom and download the `vscode-extension` artifact
    - unpack `vscode-extension.zip`
    - run `code --install-extension vitale-vscode-[version].vsix` (or run
      `Extensions: Install from VSIX...` from the command palette)

2.  Install the `@githubnext/vitale` package in your project:

    - `pnpm add -D @githubnext/vitale` (or equivalent in `npm` or `yarn` etc.)

      The details of the RPC protocol between extension and server change frequently,
      so you should use matching versions.

3.  (Optional) Install the `@githubnext/typescript` package in your project:

    - `pnpm add -D typescript@npm:@githubnext/typescript`

      This is a patched version of of TypeScript 5.4.5 which hacks in support
      for the pathnames that VS Code uses for notebook cells (with stock
      TypeScript, `tsserver` can't find the `tsconfig.json` and can't find
      referenced project files, so you get a lot of spurious squiggles).

## Getting started

For background on the VS Code notebook UI see [Jupyter Notebooks in VS
Code](https://code.visualstudio.com/docs/datascience/jupyter-notebooks) (but
ignore the stuff about Jupyter specifically).

To make a `vitale` notebook, create a new file with a `.vnb` extension.

A cell can contain a single expression, or a sequence of statements where the
last statement is an expression. (Note that an object literal in statement
position must be wrapped in parentheses to avoid being parsed as a block.)

The output of a cell is the value of the expression; if the expression is a
promise, it will be `await`ed automatically; if there's no trailing expression
or the expression is undefined there's no output.

Ordinarily cells are executed server-side in a Node environment, but see below
about client-side rendering.

## Defining and referencing variables

Variables defined at the top level in a cell are available to other cells (once
the defining cell has been executed). If you want a variable to be private to a
cell (e.g. to avoid colliding with another definition), define it inside a block.

Re-executing a cell that defines variables used in other cells will cause the
dependent cells to be re-executed automatically. If you don't want this behavior
for some reason (e.g. you have a long-running cell) you can use the
![pause](./assets/CodiconDebugPause.svg) /
![play](./assets/CodiconDebugStart.svg) buttons in the cell status bar to pause
and restart execution; or if you want to turn it off globally you can uncheck
the "Vitale: Rerun Cells When Dirty" setting.

## Importing modules

You can import installed modules as usual, e.g.

```ts
import { Octokit } from "@octokit/core";
```

Imports are visible in other cells once the importing cell has been executed.

You can also import project files with a path relative to the notebook file,
e.g.

```ts
import { foo } from "./bar.ts";
```

and changes to the imported file will cause dependent cells to re-execute as
above.

## Environment variables

`vitale` inherits the environment variable setup from Vite, see [Env Variables
and Modes](https://vitejs.dev/guide/env-and-mode.html).

Since code in cells is transformed by Vite, you need to prefix variables with
`VITE_` in order for them to be visible.

## Output panes

Cell output is displayed below the cell. You can open the output in a separate
pane by clicking the ![preview](./assets/CodiconOpenPreview.svg) button in the
cell toolbar. Output in a separate pane is updated when the cell is reëxecuted
or when dependencies change.

## Rendering different MIME types

`vitale` inspects the output value and tries to pick an appropriate MIME type to
render it. For most Javascript objects this is `application/json`, which is
rendered by VS Code with syntax highlighting. For complex objects you can render
an expandable view (using
[react-json-view](https://github.com/uiwjs/react-json-view)) by returning the
`application/x-json-view` MIME type. `HTMLElement` and `SVGElement` objects are
rendered as `text/html` and `image/svg+xml` respectively (see below for an
example).

To set the MIME type of the output explicitly, return an object of type `{ data:
string, mime: string }` (currently there's no way to return binary data). VS
Code has several built-in renderers (see [Rich
Output](https://code.visualstudio.com/api/extension-guides/notebook#rich-output))
and you can install others as extensions.

There are helper functions in `@githubnext/vitale` to construct these
MIME-tagged outputs:

```ts
function text(data: string);
function markdown(data: string);
function html(html: string | { outerHTML: string });
function svg(html: string | { outerHTML: string });
function json(obj: object);
function jsonView(obj: object);
```

This package is auto-imported under the name `Vitale` in notebook cells, so you can write e.g.

```ts
Vitale.jsonView({ foo: "bar" });
```

You can construct `HTMLElement` and `SVGElement` values using `jsdom` or a
similar library; for example, to render an SVG from [Observable
Plot](https://observablehq.com/plot/):

```ts
import * as Plot from "@observablehq/plot";
import { JSDOM } from "jsdom";
const { document } = new JSDOM().window;

const xs = Array.from({ length: 20 }, (_, i) => i);
const xys = xs.map((x) => [x, Math.sin(x / Math.PI)]);

Plot.plot({
  inset: 10,
  marks: [Plot.line(xys)],
  document,
});
```

## Rendering React components

To render a React component, write it as the last expression in a cell, like

```tsx
const Component = () => <div>Hello, world!</div>;

<Component />;
```

You can also import a component from another cell or from a project file, and
editing an imported component will trigger a hot reload of the rendered output.
(This uses Vite's hot-reloading mechanism, so it can't be paused as with
server-side re-execution.)

## Client-side rendering without React

To render a cell client-side, add `"use client"` at the top of the cell. A
variable `__vitale_cell_output_root_id__` is defined to be the ID of a DOM
element for the cell's output.

```ts
"use client";

document.getElementById(__vitale_cell_output_root_id__).innerText =
  "Hello, world!";
```

It should be possible to render non-React frameworks this way but I haven't
tried it.

## Known issues

- cancelling an execution only cancels it client-side; if you get your server
  stuck you can restart it with `Vitale: Restart Kernel`
- rerunning a React cell doesn't hot reload; the component is remounted and
  loses its state

## Development

To develop Vitale:

- `git clone https://github.com/githubnext/vitale.git`
- `cd vitale; pnpm install; pnpm -r run watch`
- open the project in VS Code, press `F5` to run

The server needs to be installed in whatever project you're testing with. You
can install the published server as above, or to link to the development
version:

- `cd packages/server; pnpm link --dir $YOURPROJECT`

The linked development server is automatically rebuilt but not hot-reloaded; you
can get the latest changed by restarting the server (run `Vitale: Restart
Kernel` from the command palette).
