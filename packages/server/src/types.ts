import type { GeneratorResult } from "@babel/generator";
import * as babelTypes from "@babel/types";

export type SourceDescription = GeneratorResult & {
  type: "server" | "client";
  autoExports: babelTypes.ImportDeclaration[];
};

export type Cell = {
  cellId: string;
  code: string;
  language: string;
  sourceDescription?: SourceDescription;
};

export type Options = {
  port: number;
};
