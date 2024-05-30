import { defineConfig } from "tsup";

export default defineConfig([
  {
    entry: ["./src/extension.ts"],
    external: ["vscode"],
    format: "cjs",
  },
  {
    entry: ["./src/jsonRenderer.tsx"],
    format: ["esm"],
    splitting: false,
    esbuildOptions(options) {
      options.define = {
        "process.env.NODE_ENV": JSON.stringify("production"),
      };
    },
  },
  {
    entry: ["./src/vitaleRenderer.tsx"],
    format: ["esm"],
    splitting: false,
    esbuildOptions(options) {
      options.define = {
        "process.env.NODE_ENV": JSON.stringify("production"),
      };
    },
  },
  {
    entry: ["./src/cellOutputWebview.ts"],
    format: ["esm"],
    splitting: false,
    esbuildOptions(options) {
      options.define = {
        "process.env.NODE_ENV": JSON.stringify("production"),
      };
    },
  },
]);
