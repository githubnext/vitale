import * as babelGenerator from "@babel/generator";
import type { ParserOptions } from "@babel/parser";
import * as babelParser from "@babel/parser";
import * as babelTypes from "@babel/types";
import type { SourceDescription } from "./types";

const reactImports = babelParser.parse(
  `
import React from "react";
import ReactDOM from "react-dom/client";
`,
  { sourceType: "module" }
).program.body;

const reactRender = babelParser.parse(
  `
ReactDOM.createRoot(
  document.getElementById(__vitale_cell_output_root_id__)
).render(
  <React.StrictMode>
    {__vitale_jsx_expression__}
  </React.StrictMode>
);
`,
  { sourceType: "module", plugins: ["jsx"] }
).program.body;

function makeCellOutputRootIdDecl(cellId: string) {
  return babelTypes.variableDeclaration("const", [
    babelTypes.variableDeclarator(
      babelTypes.identifier("__vitale_cell_output_root_id__"),
      babelTypes.stringLiteral(`cell-output-root-${cellId}`)
    ),
  ]);
}

function rewrite(
  code: string,
  language: string,
  cellId: string
): SourceDescription {
  let type: "server" | "client" = "server";

  const plugins = ((): ParserOptions["plugins"] => {
    switch (language) {
      case "typescriptreact":
        return ["typescript", "jsx"];
      case "typescript":
        return ["typescript"];
      case "javascriptreact":
        return ["jsx"];
      case "javascript":
        return [];
      default:
        throw new Error(`unknown language: ${language}`);
    }
  })();
  const parserOptions: ParserOptions = { sourceType: "module", plugins };

  let program: babelTypes.Program;

  const exprAst = (() => {
    try {
      return babelParser.parseExpression(code, parserOptions);
    } catch {
      return undefined;
    }
  })();
  if (exprAst) {
    program = babelTypes.program([babelTypes.expressionStatement(exprAst)]);
  } else {
    const ast = babelParser.parse(code, parserOptions);
    if (ast.program.body.length === 0) {
      program = babelTypes.program([
        babelTypes.expressionStatement(babelTypes.buildUndefinedNode()),
      ]);
    } else {
      program = ast.program;
    }
  }

  // "use client" directive, executed the cell verbatim on the client
  if (program.directives[0]?.value.value === "use client") {
    program.body.unshift(makeCellOutputRootIdDecl(cellId));
    type = "client";
  }

  // no "use client" directive, check for JSX
  else {
    const body = program.body;
    const last = body[body.length - 1];

    if (last.type === "ExpressionStatement") {
      // cell ends in a JSX expression, generate code to render the component
      if (
        last.expression.type === "JSXElement" ||
        last.expression.type === "JSXFragment"
      ) {
        type = "client";
        body.unshift(...reactImports);
        body.pop();
        body.push(
          babelTypes.variableDeclaration("const", [
            babelTypes.variableDeclarator(
              babelTypes.identifier("__vitale_jsx_expression__"),
              last.expression
            ),
          ])
        );
        body.push(makeCellOutputRootIdDecl(cellId));
        body.push(...reactRender);
      }

      // cell ends in a non-JSX expresion, make it the default export
      else {
        body[body.length - 1] = babelTypes.exportDefaultDeclaration(
          last.expression
        );
      }
    }

    // cell ends in a non-expression, generate a dummy default export
    else {
      body.push(
        babelTypes.exportDefaultDeclaration(babelTypes.buildUndefinedNode())
      );
    }
  }

  const generatorResult = new babelGenerator.CodeGenerator(program).generate();
  return { ast: program, code: generatorResult.code, type };
}

export default rewrite;
