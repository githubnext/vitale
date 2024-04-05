import { defineConfig } from "tsup";

export default defineConfig([
  {
    entry: ["src/cli.ts"],
    splitting: false,
    sourcemap: true,
    clean: true,
    format: "esm",
  },
  {
    entry: ["src/index.ts"],
    splitting: false,
    sourcemap: true,
    clean: true,
    format: "esm",
    dts: true,
  },
]);
