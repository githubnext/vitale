#!/usr/bin/env node

// src/cli.ts
import { createServer as createViteServer } from "vite";
async function createServer() {
  const server = await createViteServer();
  server.listen();
}
createServer();
//# sourceMappingURL=cli.js.map