import { defineConfig } from "tsup";

export default defineConfig([
  {
    entry: ["src/cli.ts"],
    splitting: false,
    sourcemap: true,
    format: "esm",
  },
  {
    entry: ["src/index.ts"],
    splitting: false,
    sourcemap: true,
    format: "esm",
    dts: true,
  },
]);
