import * as babelGenerator from "@babel/generator";
import type { ParserOptions } from "@babel/parser";
import * as babelParser from "@babel/parser";
import * as babelTypes from "@babel/types";
import traverse from "@babel/traverse";
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
  id: string,
  cellId: string,
  autoImports: babelTypes.ImportDeclaration[]
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

  let ast: babelTypes.File;

  const exprAst = (() => {
    try {
      return babelParser.parseExpression(code, parserOptions);
    } catch {
      return undefined;
    }
  })();
  if (exprAst) {
    ast = babelTypes.file(
      babelTypes.program([babelTypes.expressionStatement(exprAst)])
    );
  } else {
    ast = babelParser.parse(code, parserOptions);
    if (ast.program.body.length === 0) {
      ast.program = babelTypes.program([
        babelTypes.expressionStatement(babelTypes.buildUndefinedNode()),
      ]);
    }
  }

  const exportedNames: string[] = [];
  for (const [i, stmt] of ast.program.body.entries()) {
    if (stmt.type === "ImportDeclaration") {
      // TODO(jaked)
      // need to clean up autoImports when cell changes
      autoImports.push(stmt);
    } else if (stmt.type === "VariableDeclaration") {
      // TODO(jaked)
      // handle function declarations
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

  const unbound = new Set<string>();
  traverse.default(ast, {
    ReferencedIdentifier(path) {
      if (!path.scope.hasBinding(path.node.name)) {
        unbound.add(path.node.name);
      }
    },
  });
  next: for (const name of unbound) {
    for (const decl of autoImports) {
      for (const spec of decl.specifiers) {
        if (spec.local.name === name) {
          ast.program.body.unshift(
            babelTypes.importDeclaration([spec], decl.source)
          );
          continue next;
        }
      }
    }
  }

  // TODO(jaked)
  // need to clean up autoImports when cell changes
  autoImports.push(
    babelTypes.importDeclaration(
      exportedNames.map((name) => {
        const ident = babelTypes.identifier(name);
        return babelTypes.importSpecifier(ident, ident);
      }),
      babelTypes.stringLiteral(id)
    )
  );

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

  const generatorResult = new babelGenerator.CodeGenerator(ast).generate();
  return {
    ast,
    code: generatorResult.code,
    type,
  };
}

export default rewrite;
