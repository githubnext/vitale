import { defineConfig } from "tsup";

export default defineConfig([
  {
    entry: ["./src/extension.ts"],
    external: ["vscode"],
    format: "cjs",
    sourcemap: true,
  },
  {
    entry: ["./src/jsonRenderer.tsx"],
    external: ["vscode"],
    format: ["esm"],
    sourcemap: true,
    splitting: false,
    esbuildOptions(options) {
      options.define = {
        "process.env.NODE_ENV": JSON.stringify("production"),
      };
    },
  },
  {
    entry: ["./src/vitaleRenderer.tsx"],
    external: ["vscode"],
    format: ["esm"],
    sourcemap: true,
    splitting: false,
    esbuildOptions(options) {
      options.define = {
        "process.env.NODE_ENV": JSON.stringify("production"),
      };
    },
  },
]);
