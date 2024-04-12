# Vitale

`vitale` is a notebook for Node + TypeScript that uses `vite` for compilation
and hot-reloading.

## Installation

1.  Install the `.vsix` from the latest build:

    - go to https://github.com/githubnext/vitale/actions/workflows/vsix.yml
    - click on the latest run
    - scroll to the bottom and download the `vscode-extension` artifact
    - unpack `vscode-extension.zip`
    - run `code --install-extension vitale-vscode-0.0.1.vsix` (or run
      `Extensions: Install from VSIX...` from the command palette)

2.  Install the `@githubnext/vitale` package in your project:

    - `pnpm add -D @githubnext/vitale` (or equivalent in `npm` or `yarn` etc.)

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

## Getting started

For background on the notebook UI see
https://code.visualstudio.com/docs/datascience/jupyter-notebooks (ignore the
stuff about Jupyter).

To make a `vitale` notebook, create a new file with a `.vnb` extension.

A cell can contain a single expression, or a sequence of statements where the
last statement is an expression. (Note that an object literal in statement
position must be wrapped in parentheses to avoid being parsed as a block.)

The output of a cell is the value of the expression; if the expression is a
promise, it will be `await`ed automatically; if there's no trailing expression
or the expression is undefined there's no output.

Object values are returned with MIME type `application/json` and rendered using
`react-json-view`. `HTMLElement` values are returned with MIME type `text/html`
and rendered as HTML. To override the MIME type, return an object of type `{
data: string, mime: string }` (currently there's no way to return binary data);
VS Code has several built-in renderers (see
https://code.visualstudio.com/api/extension-guides/notebook#rich-output) and you
can install others as extensions.

To restart the server, run `Vitale: Restart Kernel` from the command palette.

## Rendering React components

To render a React component, write it as the last expression in a cell, like

```tsx
const Component = () => <div>Hello, world!</div>;

<Component />;
```

You can also import a component from another file, and editing an imported component will trigger a hot reload of the rendered output.

## Client-side rendering

To render a cell client-side, add `"use client"` at the top of the cell. A
variable `__vitale_cell_output_root_id__` is defined to be the ID of a DOM
element for the cell's output.

```ts
"use client";

document.getElementById(__vitale_cell_output_root_id__).innerText =
  "Hello, world!";
```

This should work to render components in non-React frameworks, but
framework-specific hot-reloading won't work yet (there is special support in the
custom renderer for React hot-reloading).

## Known issues

- cancelling an execution only cancels it client-side; if you get your server
  stuck you can restart it with `Vitale: Restart Kernel`
- each cell is its own module; you can't reference variables defined in other
  cells, and you need to repeat imports in each cell
- rerunning a React cell doesn't hot reload; the component is remounted and
  loses its state
- rendered output of client-side cells gets cleared when you save the notebook
  or restart the server, and after that rendering is broken; you can recover by
  closing and reopening the notebook
