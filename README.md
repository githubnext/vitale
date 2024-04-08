# Vitale

`vitale` is a notebook for Node + TypeScript that uses `vite` for compilation
and hot-reloading.

## Installation

- ~~install the `.vsix`~~
- ~~install the `vitale` package in your project~~

Currently there's no `.vsix`; you can run the extension from source:

- `git clone https://github.com/githubnext/vitale.git`
- `cd vitale; pnpm install; pnpm -r run watch`
- open the project in VS Code, press `F5` to run

Currently `vitale` is not published; you can install it by linking to a
clone of this repo:

- `git clone https://github.com/githubnext/vitale.git`
- `cd vitale; pnpm install; pnpm -r run watch`
- `cd packages/server; pnpm link --dir $YOURPROJECT`

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

## Known issues

- the server process is not cleaned up when the extension is deactivated (I'm not sure when this happens actually)
- cancelling an execution only cancels it client-side; if you get your server stuck you can restart it with `Vitale: Restart Kernel`
- each cell is its own module; you can't reference variables defined in other cells
