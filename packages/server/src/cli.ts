#!/usr/bin/env node
import { createServer as createViteServer } from "vite";

async function createServer() {
  const server = await createViteServer();

  server.listen();
}

createServer();
