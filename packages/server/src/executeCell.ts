import { Cells, cellIdRegex } from "./cells";
import { createDomain } from "./domain";
import rewrite from "./rewrite";
import { Rpc } from "./rpc";
import type { CellOutput, CellOutputItem } from "./rpc-types";
import { Runtime } from "./runtime";

interface PossibleSVG {
  outerHTML: string;
}

function isSVGElementLike(obj: unknown): obj is PossibleSVG {
  return (
    obj !== null &&
    typeof obj === "object" &&
    "outerHTML" in obj &&
    typeof obj.outerHTML === "string" &&
    obj.outerHTML.startsWith("<svg")
  );
}

interface PossibleHTML {
  outerHTML: string;
}

function isHTMLElementLike(obj: unknown): obj is PossibleHTML {
  return (
    obj !== null &&
    typeof obj === "object" &&
    "outerHTML" in obj &&
    typeof obj.outerHTML === "string"
  );
}

function mimeTaggedResultOf(result: any) {
  if (
    typeof result === "object" &&
    "data" in result &&
    typeof result.data === "string" &&
    "mime" in result &&
    typeof result.mime === "string"
  ) {
    return result;
  } else if (isSVGElementLike(result)) {
    return { mime: "image/svg+xml", data: result.outerHTML };
  } else if (isHTMLElementLike(result)) {
    return { mime: "text/html", data: result.outerHTML };
  } else if (typeof result === "object") {
    return { mime: "application/json", data: JSON.stringify(result) };
  } else {
    return { mime: "text/x-javascript", data: JSON.stringify(result) };
  }
}

function rewriteStack(stack: undefined | string): undefined | string {
  if (!stack) {
    return stack;
  }

  const i = stack.indexOf("\n    at ESModulesRunner.runViteModule");
  if (i !== -1) {
    return stack.substring(0, i);
  } else {
    return stack;
  }
}

export async function executeCell(
  rpc: Rpc,
  cells: Cells,
  runtime: Runtime,
  id: string,
  path: string,
  cellId: string,
  force: boolean
) {
  // TODO(jaked)
  // await so client finishes startCellExecution before we send endCellExecution
  // would be better for client to lock around startCellExecution
  const startOK = await rpc.startCellExecution(path, cellId, force);
  if (!startOK) {
    return false;
  }

  let mimeTaggedResult;
  const stdoutChunks: Buffer[] = [];
  const stderrChunks: Buffer[] = [];

  try {
    const cell = cells.get(id);
    if (!cell) throw new Error(`cell not found: ${id}`);

    if (!cell.sourceDescription) {
      const [_, path] = cellIdRegex.exec(id)!;
      cell.sourceDescription = rewrite(
        cell.code,
        cell.language,
        id,
        cell.cellId,
        cells.forPath(path)
      );
    }

    // client execution
    if (cell.sourceDescription.type === "client") {
      mimeTaggedResult = {
        data: JSON.stringify({
          // TODO(jaked) strip workspace root when executeCell is called
          id: id.substring(runtime.root.length + 1),
          origin: runtime.origin,
        }),
        mime: "application/x-vitale",
      };
    }

    // server execution
    else {
      const domain = createDomain(stdoutChunks, stderrChunks);
      let { default: result } = await domain.run(
        async () => await runtime.executeUrl(id)
      );
      if (result instanceof Promise) result = await result;
      mimeTaggedResult = mimeTaggedResultOf(result);
    }
  } catch (e) {
    const err = e as Error;
    const obj = {
      name: err.name,
      message: err.message,
      stack: rewriteStack(err.stack),
    };
    mimeTaggedResult = {
      data: JSON.stringify(obj, undefined, "\t"),
      mime: "application/vnd.code.notebook.error",
    };
  }

  const items: CellOutputItem[] = [];
  if (mimeTaggedResult !== undefined) {
    items.push({
      data: [...Buffer.from(mimeTaggedResult.data, "utf8").values()],
      mime: mimeTaggedResult.mime,
    });
  }
  if (stdoutChunks.length > 0) {
    items.push({
      data: [...Buffer.concat(stdoutChunks).values()],
      mime: "application/vnd.code.notebook.stdout",
    });
  }
  if (stderrChunks.length > 0) {
    items.push({
      data: [...Buffer.concat(stderrChunks).values()],
      mime: "application/vnd.code.notebook.stderr",
    });
  }
  const cellOutput: CellOutput = { items };

  await rpc.endCellExecution(path, cellId, cellOutput);
  return true;
}
