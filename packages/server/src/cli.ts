#!/usr/bin/env node
import cac from "cac";
import { version } from "../package.json";
import { createServer } from "./server";
import type { Options } from "./types";

const defaultPort = 51205;

const cli = cac("vitale");

cli.version(version);
cli
  .command("[root]", "Start the Vitale server")
  .alias("start")
  .alias("dev")
  .option("--port <port>", "Port to listen on", { default: defaultPort })
  .action(async (_root: string, options: Options) => {
    const convertedPort = Number(options.port);
    const port = Number.isNaN(convertedPort) ? defaultPort : convertedPort;
    const server = await createServer({ port });

    server.listen();
  });

cli.parse();
