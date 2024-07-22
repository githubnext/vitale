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

// TODO(jaked)
// I don't really understand how async stack traces work
// but I've seen all of these as the top internal stack frame
// before the cell code
const stackFrameRegex = /^\s+at (Domain|Runner|executeCell)/;

function rewriteStack(stack: undefined | string): undefined | string {
  if (!stack) {
    return stack;
  }

  const lines = stack.split("\n");
  const rewrittenLines = [];
  for (const line of lines) {
    if (stackFrameRegex.test(line)) {
      break;
    }
    rewrittenLines.push(line);
  }
  return rewrittenLines.join("\n");
}

function mimeTaggedResultOf(result: any) {
  if (result === undefined) {
    return undefined;
  } else if (result instanceof Error) {
    const obj = {
      name: result.name,
      message: result.message,
      stack: rewriteStack(result.stack),
    };
    return {
      data: JSON.stringify(obj, undefined, "\t"),
      mime: "application/vnd.code.notebook.error",
    };
  } else if (isSVGElementLike(result)) {
    return { mime: "image/svg+xml", data: result.outerHTML };
  } else if (isHTMLElementLike(result)) {
    return { mime: "text/html", data: result.outerHTML };
  } else if (
    typeof result === "object" &&
    "data" in result &&
    typeof result.data === "string" &&
    "mime" in result &&
    typeof result.mime === "string"
  ) {
    return result;
  } else if (typeof result === "object") {
    return { mime: "application/json", data: JSON.stringify(result) };
  } else {
    return { mime: "text/x-javascript", data: JSON.stringify(result) };
  }
}

function makeCellOutput(result: any) {
  const mimeTaggedResult = mimeTaggedResultOf(result);

  const items: CellOutputItem[] = [];
  if (mimeTaggedResult !== undefined) {
    items.push({
      data: [...Buffer.from(mimeTaggedResult.data, "utf8").values()],
      mime: mimeTaggedResult.mime,
    });
  }
  const cellOutput: CellOutput = { items };
  return cellOutput;
}

async function endCellExecutionWithOutput(
  rpc: Rpc,
  path: string,
  cellId: string,
  result: any
): Promise<boolean> {
  const cellOutput = makeCellOutput(result);
  await rpc.endCellExecution(path, cellId, cellOutput);
  return true;
}

function isIterator(obj: any): obj is Iterator<any> {
  return (
    obj &&
    typeof obj.next === "function" &&
    typeof obj.return === "function" &&
    typeof obj.throw === "function"
  );
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

  const cell = cells.get(id);
  if (!cell) {
    try {
      throw new Error(`cell not found: ${id}`);
    } catch (e) {
      return await endCellExecutionWithOutput(rpc, path, cellId, e);
    }
  }

  if (!cell.sourceDescription) {
    const [_, path] = cellIdRegex.exec(id)!;
    try {
      cell.sourceDescription = rewrite(
        cell.code,
        cell.language,
        id,
        cell.cellId,
        cells.forPath(path)
      );
    } catch (e) {
      return await endCellExecutionWithOutput(rpc, path, cellId, e);
    }
  }

  // client execution
  if (cell.sourceDescription.type === "client") {
    const result = {
      data: JSON.stringify({
        // TODO(jaked) strip workspace root when executeCell is called
        id: id.substring(runtime.root.length + 1),
        origin: runtime.origin,
      }),
      mime: "application/x-vitale",
    };
    return await endCellExecutionWithOutput(rpc, path, cellId, result);
  }

  // server execution
  const domain = createDomain(
    (chunk) => {
      rpc.outputStdout(path, cellId, chunk.toString("utf8"));
    },
    (chunk) => {
      rpc.outputStderr(path, cellId, chunk.toString("utf8"));
    }
  );

  let result: any;
  result = await domain
    .run(async () => await runtime.executeUrl(id))
    .then((mod) => mod.default)
    .catch((e) => e);

  if (result instanceof Promise) {
    result = await domain.run(async () => await result).catch((e) => e);
    return await endCellExecutionWithOutput(rpc, path, cellId, result);
  } else if (isIterator(result)) {
    while (true) {
      const item = await domain
        .run(async () => await result.next())
        .catch((e) => e);
      if (item instanceof Error) {
        return await endCellExecutionWithOutput(rpc, path, cellId, item);
      }
      if (item.value !== undefined) {
        await rpc.updateCellOutput(path, cellId, makeCellOutput(item.value));
      }
      if (item.done) {
        rpc.endCellExecution(path, cellId);
        return true;
      }
    }
  } else {
    return await endCellExecutionWithOutput(rpc, path, cellId, result);
  }
}
