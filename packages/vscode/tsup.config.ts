import { defineConfig } from "tsup";

export default defineConfig([
  {
    clean: true,
    entry: ["./src/extension.ts"],
    external: ["vscode"],
    format: "cjs",
  },
  // {
  //   clean: true,
  //   entry: ["./src/notebook/objectRenderer.tsx"],
  //   external: ["vscode"],
  //   format: ["esm"],
  //   splitting: false,
  //   esbuildOptions(options) {
  //     options.define = {
  //       "process.env.NODE_ENV": JSON.stringify("production"),
  //     };
  //   },
  // },
]);
