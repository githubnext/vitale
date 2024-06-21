import { ESModulesRunner, ViteRuntime } from "vite/runtime";
import type { ViteDevServer } from "vite";
import * as Path from "node:path";
import { handleHMRUpdate } from "./hmr";
import { cellIdRegex } from "./cells";

export class Runtime {
  private viteServer: ViteDevServer;
  private viteRuntime: ViteRuntime;

  constructor(viteServer: ViteDevServer) {
    this.viteServer = viteServer;
    this.viteRuntime = new ViteRuntime(
      {
        root: viteServer.config.root,
        fetchModule: viteServer.ssrFetchModule,
      },
      new ESModulesRunner()
    );
  }

  invalidateServerModule(id: string) {
    const mod = this.viteServer.moduleGraph.getModuleById(id);
    if (mod) {
      this.viteServer.moduleGraph.invalidateModule(mod);
    }
  }

  handleHMRUpdate(id: string) {
    handleHMRUpdate(id, this.viteServer);
  }

  invalidateRuntimeModule(
    id: string,
    dirtyCells: { path: string; cellId: string; ext: string }[]
  ) {
    const mod = this.viteRuntime.moduleCache.get(id);
    this.viteRuntime.moduleCache.delete(id);

    const match = cellIdRegex.exec(id);
    if (match) {
      const [_, path, cellId, ext] = match;
      if (
        !dirtyCells.some((cell) => cell.path === path && cell.cellId === cellId)
      ) {
        dirtyCells.push({ path, cellId, ext });
      }
    }

    for (const dep of mod.importers ?? []) {
      this.invalidateRuntimeModule(
        Path.join(this.viteServer.config.root, dep),
        dirtyCells
      );
    }
  }

  executeUrl(id: string) {
    return this.viteRuntime.executeUrl(id);
  }

  get root() {
    return this.viteServer.config.root;
  }

  get origin() {
    return this.viteServer.config.server.origin;
  }
}
