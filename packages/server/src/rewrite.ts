import _babelGenerator from "@babel/generator";
import type { ParserOptions } from "@babel/parser";
import * as babelParser from "@babel/parser";
import _babelTraverse from "@babel/traverse";
import * as babelTypes from "@babel/types";
import type { SourceDescription } from "./types";
const babelGenerator: typeof _babelGenerator = (_babelGenerator as any).default;
const babelTraverse: typeof _babelTraverse = (_babelTraverse as any).default;

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

function parseCode(code: string, language: string) {
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

  const exprAst = (() => {
    try {
      return babelParser.parseExpression(code, parserOptions);
    } catch {
      return undefined;
    }
  })();
  if (exprAst) {
    if (exprAst.type === "FunctionExpression") {
      return babelTypes.file(
        babelTypes.program([
          babelTypes.functionDeclaration(
            exprAst.id,
            exprAst.params,
            exprAst.body,
            exprAst.generator,
            exprAst.async
          ),
        ])
      );
    } else {
      return babelTypes.file(
        babelTypes.program([babelTypes.expressionStatement(exprAst)])
      );
    }
  } else {
    const ast = babelParser.parse(code, parserOptions);
    if (ast.program.body.length === 0) {
      ast.program = babelTypes.program([
        babelTypes.expressionStatement(babelTypes.buildUndefinedNode()),
      ]);
    }
    return ast;
  }
}

function findAutoExports(
  ast: babelTypes.File,
  id: string
): babelTypes.ImportDeclaration[] {
  const autoExports: babelTypes.ImportDeclaration[] = [];
  const exportedNames: string[] = [];
  for (const [i, stmt] of ast.program.body.entries()) {
    if (stmt.type === "ImportDeclaration") {
      autoExports.push(stmt);
    } else if (stmt.type === "FunctionDeclaration" && stmt.id) {
      ast.program.body[i] = babelTypes.exportNamedDeclaration(stmt);
      exportedNames.push(stmt.id?.name);
    } else if (stmt.type === "VariableDeclaration") {
      ast.program.body[i] = babelTypes.exportNamedDeclaration(stmt);
      for (const decl of stmt.declarations) {
        if (decl.id.type === "Identifier") {
          exportedNames.push(decl.id.name);
        } else if (decl.id.type === "ObjectPattern") {
          for (const prop of decl.id.properties) {
            if (
              prop.type === "ObjectProperty" &&
              prop.value.type === "Identifier"
            ) {
              exportedNames.push(prop.value.name);
            }
          }
        }
      }
    }
  }
  autoExports.push(
    babelTypes.importDeclaration(
      exportedNames.map((name) => {
        const ident = babelTypes.identifier(name);
        return babelTypes.importSpecifier(ident, ident);
      }),
      babelTypes.stringLiteral(id)
    )
  );
  return autoExports;
}

function findAutoImports(
  ast: babelTypes.File,
  cells: Map<string, SourceDescription>
): babelTypes.ImportDeclaration[] {
  const unbound = new Set<string>();
  babelTraverse(ast, {
    ReferencedIdentifier(path) {
      if (!path.scope.hasBinding(path.node.name)) {
        unbound.add(path.node.name);
      }
    },
  });

  const autoImports: babelTypes.ImportDeclaration[] = [];
  next: for (const name of unbound) {
    for (const cell of cells.values()) {
      for (const decl of cell.autoExports) {
        for (const spec of decl.specifiers) {
          if (spec.local.name === name) {
            autoImports.push(babelTypes.importDeclaration([spec], decl.source));
            continue next;
          }
        }
      }
    }
  }
  return autoImports;
}

function rewrite(
  code: string,
  language: string,
  id: string,
  cellId: string,
  cells: Map<string, SourceDescription>
): SourceDescription {
  let type: "server" | "client" = "server";

  const ast = parseCode(code, language);
  const autoExports = findAutoExports(ast, id);
  const autoImports = findAutoImports(ast, cells);
  ast.program.body.unshift(...autoImports);

  // "use client" directive, executed the cell verbatim on the client
  if (ast.program.directives[0]?.value.value === "use client") {
    ast.program.body.unshift(makeCellOutputRootIdDecl(cellId));
    type = "client";
  }

  // no "use client" directive, check for JSX
  else {
    const body = ast.program.body;
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

  const generatorResult = babelGenerator(ast);
  return {
    ast,
    code: generatorResult.code,
    type,
    autoExports,
  };
}

export default rewrite;
