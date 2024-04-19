import path from "node:path";
import colors from "picocolors";
import type { ModuleNode, Update, ViteDevServer } from "vite";

// this is cut down from the Vite implementation
// vite/src/node/server/hmr.ts

interface PropagationBoundary {
  boundary: ModuleNode;
  acceptedVia: ModuleNode;
  isWithinCircularImport: boolean;
}

export async function handleHMRUpdate(
  id: string,
  server: ViteDevServer
): Promise<void> {
  const { moduleGraph } = server;

  const module = moduleGraph.getModuleById(id);
  if (!module) {
    return;
  }

  // check if any plugin wants to perform custom HMR handling
  const timestamp = Date.now();

  updateModules(id, module, timestamp, server);
}

type HasDeadEnd = boolean;

export function updateModules(
  id: string,
  module: ModuleNode,
  timestamp: number,
  { config, hot, moduleGraph }: ViteDevServer,
  afterInvalidation?: boolean
): void {
  const updates: Update[] = [];
  const invalidatedModules = new Set<ModuleNode>();
  const traversedModules = new Set<ModuleNode>();
  let needFullReload: HasDeadEnd = false;

  const boundaries: PropagationBoundary[] = [];
  const hasDeadEnd = propagateUpdate(module, traversedModules, boundaries);

  moduleGraph.invalidateModule(module, invalidatedModules, timestamp, true);

  if (hasDeadEnd) {
    needFullReload = hasDeadEnd;
  }

  updates.push(
    ...boundaries.map(({ boundary, acceptedVia, isWithinCircularImport }) => ({
      type: `${boundary.type}-update` as const,
      timestamp,
      path: normalizeHmrUrl(boundary.url),
      acceptedPath: normalizeHmrUrl(acceptedVia.url),
      explicitImportRequired: false,
      isWithinCircularImport,
      // browser modules are invalidated by changing ?t= query,
      // but in ssr we control the module system, so we can directly remove them form cache
      ssrInvalidates: getSSRInvalidatedImporters(acceptedVia),
    }))
  );

  if (needFullReload) {
    const reason =
      typeof needFullReload === "string"
        ? colors.dim(` (${needFullReload})`)
        : "";
    config.logger.info(colors.green(`page reload `) + colors.dim(id) + reason, {
      clear: !afterInvalidation,
      timestamp: true,
    });
    hot.send({
      type: "full-reload",
      triggeredBy: path.resolve(config.root, id),
    });
    return;
  }

  if (updates.length === 0) {
    return;
  }

  config.logger.info(
    colors.green(`hmr update `) +
      colors.dim([...new Set(updates.map((u) => u.path))].join(", ")),
    { clear: !afterInvalidation, timestamp: true }
  );
  hot.send({
    type: "update",
    updates,
  });
}

function populateSSRImporters(
  module: ModuleNode,
  timestamp: number,
  seen: Set<ModuleNode> = new Set()
) {
  module.ssrImportedModules.forEach((importer) => {
    if (seen.has(importer)) {
      return;
    }
    if (
      importer.lastHMRTimestamp === timestamp ||
      importer.lastInvalidationTimestamp === timestamp
    ) {
      seen.add(importer);
      populateSSRImporters(importer, timestamp, seen);
    }
  });
  return seen;
}

function getSSRInvalidatedImporters(module: ModuleNode) {
  return [...populateSSRImporters(module, module.lastHMRTimestamp)].map(
    (m) => m.file!
  );
}

function areAllImportsAccepted(
  importedBindings: Set<string>,
  acceptedExports: Set<string>
) {
  for (const binding of importedBindings) {
    if (!acceptedExports.has(binding)) {
      return false;
    }
  }
  return true;
}

function propagateUpdate(
  node: ModuleNode,
  traversedModules: Set<ModuleNode>,
  boundaries: PropagationBoundary[],
  currentChain: ModuleNode[] = [node]
): HasDeadEnd {
  if (traversedModules.has(node)) {
    return false;
  }
  traversedModules.add(node);

  // #7561
  // if the imports of `node` have not been analyzed, then `node` has not
  // been loaded in the browser and we should stop propagation.
  if (node.id && node.isSelfAccepting === undefined) {
    return false;
  }

  if (node.isSelfAccepting) {
    boundaries.push({
      boundary: node,
      acceptedVia: node,
      isWithinCircularImport: isNodeWithinCircularImports(node, currentChain),
    });

    return false;
  }

  // A partially accepted module with no importers is considered self accepting,
  // because the deal is "there are parts of myself I can't self accept if they
  // are used outside of me".
  // Also, the imported module (this one) must be updated before the importers,
  // so that they do get the fresh imported module when/if they are reloaded.
  if (node.acceptedHmrExports) {
    boundaries.push({
      boundary: node,
      acceptedVia: node,
      isWithinCircularImport: isNodeWithinCircularImports(node, currentChain),
    });
  } else {
    if (!node.importers.size) {
      return true;
    }
  }

  for (const importer of node.importers) {
    const subChain = currentChain.concat(importer);

    if (importer.acceptedHmrDeps.has(node)) {
      boundaries.push({
        boundary: importer,
        acceptedVia: node,
        isWithinCircularImport: isNodeWithinCircularImports(importer, subChain),
      });
      continue;
    }

    if (node.id && node.acceptedHmrExports && importer.importedBindings) {
      const importedBindingsFromNode = importer.importedBindings.get(node.id);
      if (
        importedBindingsFromNode &&
        areAllImportsAccepted(importedBindingsFromNode, node.acceptedHmrExports)
      ) {
        continue;
      }
    }

    if (
      !currentChain.includes(importer) &&
      propagateUpdate(importer, traversedModules, boundaries, subChain)
    ) {
      return true;
    }
  }
  return false;
}

/**
 * Check importers recursively if it's an import loop. An accepted module within
 * an import loop cannot recover its execution order and should be reloaded.
 *
 * @param node The node that accepts HMR and is a boundary
 * @param nodeChain The chain of nodes/imports that lead to the node.
 *   (The last node in the chain imports the `node` parameter)
 * @param currentChain The current chain tracked from the `node` parameter
 * @param traversedModules The set of modules that have traversed
 */
function isNodeWithinCircularImports(
  node: ModuleNode,
  nodeChain: ModuleNode[],
  currentChain: ModuleNode[] = [node],
  traversedModules = new Set<ModuleNode>()
): boolean {
  // To help visualize how each parameters work, imagine this import graph:
  //
  // A -> B -> C -> ACCEPTED -> D -> E -> NODE
  //      ^--------------------------|
  //
  // ACCEPTED: the node that accepts HMR. the `node` parameter.
  // NODE    : the initial node that triggered this HMR.
  //
  // This function will return true in the above graph, which:
  // `node`         : ACCEPTED
  // `nodeChain`    : [NODE, E, D, ACCEPTED]
  // `currentChain` : [ACCEPTED, C, B]
  //
  // It works by checking if any `node` importers are within `nodeChain`, which
  // means there's an import loop with a HMR-accepted module in it.

  if (traversedModules.has(node)) {
    return false;
  }
  traversedModules.add(node);

  for (const importer of node.importers) {
    // Node may import itself which is safe
    if (importer === node) continue;

    // Check circular imports
    const importerIndex = nodeChain.indexOf(importer);
    if (importerIndex > -1) {
      return true;
    }

    // Continue recursively
    if (!currentChain.includes(importer)) {
      const result = isNodeWithinCircularImports(
        importer,
        nodeChain,
        currentChain.concat(importer),
        traversedModules
      );
      if (result) return result;
    }
  }
  return false;
}

export function handlePrunedModules(
  mods: Set<ModuleNode>,
  { hot }: ViteDevServer
): void {
  // update the disposed modules' hmr timestamp
  // since if it's re-imported, it should re-apply side effects
  // and without the timestamp the browser will not re-import it!
  const t = Date.now();
  mods.forEach((mod) => {
    mod.lastHMRTimestamp = t;
    // lastHMRInvalidationReceived is private
    // mod.lastHMRInvalidationReceived = false;
  });
  hot.send({
    type: "prune",
    paths: [...mods].map((m) => m.url),
  });
}

export function normalizeHmrUrl(url: string): string {
  return url;
}
