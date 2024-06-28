import { Rpc } from "./rpc";

// from vites/src/shared/utils.ts
export const AsyncFunction = async function () {}
  .constructor as typeof Function;

// from vite/src/runtime/constants.ts
const ssrModuleExportsKey = `__vite_ssr_exports__`;
const ssrImportKey = `__vite_ssr_import__`;
const ssrDynamicImportKey = `__vite_ssr_dynamic_import__`;
const ssrExportAllKey = `__vite_ssr_exportAll__`;
const ssrImportMetaKey = `__vite_ssr_import_meta__`;

// faked out to avoid dragging in deps
// original is from vite/src/runtime/types.ts
type ViteRuntimeModuleContext = Record<string, any>;

// from vite/src/runtime/runtime.ts
interface ViteModuleRunner {
  /**
   * Run code that was transformed by Vite.
   * @param context Function context
   * @param code Transformed code
   * @param id ID that was used to fetch the module
   */
  runViteModule(
    context: ViteRuntimeModuleContext,
    code: string,
    id: string
  ): Promise<any>;
  /**
   * Run externalized module.
   * @param file File URL to the external module
   */
  runExternalModule(file: string): Promise<any>;
}

const rpcKey = "__vitale_rpc__";

//
export class Runner implements ViteModuleRunner {
  private rpc: Rpc;
  constructor(rpc: Rpc) {
    this.rpc = rpc;
  }

  async runViteModule(
    context: ViteRuntimeModuleContext,
    code: string
  ): Promise<any> {
    // use AsyncFunction instead of vm module to support broader array of environments out of the box
    const initModule = new AsyncFunction(
      ssrModuleExportsKey,
      ssrImportMetaKey,
      ssrImportKey,
      ssrDynamicImportKey,
      ssrExportAllKey,
      rpcKey,
      // source map should already be inlined by Vite
      `"use strict"; global["${rpcKey}"] = ${rpcKey}; ` + code
    );

    await initModule(
      context[ssrModuleExportsKey],
      context[ssrImportMetaKey],
      context[ssrImportKey],
      context[ssrDynamicImportKey],
      context[ssrExportAllKey],
      this.rpc
    );

    Object.seal(context[ssrModuleExportsKey]);
  }

  runExternalModule(filepath: string): Promise<any> {
    return import(filepath);
  }
}
