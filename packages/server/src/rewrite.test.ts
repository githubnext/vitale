import { expect, it } from "vitest";
import rewrite from "./rewrite";

it("rewrites", () => {
  const code = "{ foo: 'bar' }";
  const language = "typescript";
  const id = "id";
  const cellId = "cellId";
  const cells = new Map();

  const result = rewrite(code, language, id, cellId, cells);

  expect(result.code).toEqual("export default {\n  foo: 'bar'\n};");
});
