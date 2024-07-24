#!/usr/bin/env node

import { Octokit } from "@octokit/core";
import { Readable } from "node:stream";
import * as fs from "node:fs";

const octokit = new Octokit({ auth: process.env.GITHUB_TOKEN });

const release = await octokit.request(
  "GET /repos/{owner}/{repo}/releases/latest",
  {
    owner: "githubnext",
    repo: "vitale",
  }
);

const assets = await octokit.request(
  "GET /repos/{owner}/{repo}/releases/{release_id}/assets",
  {
    owner: "githubnext",
    repo: "vitale",
    release_id: release.data.id,
  }
);
const asset = assets.data[0];

const res = await fetch(asset.browser_download_url, {
  headers: {
    Authorization: `Bearer ${process.env.GITHUB_TOKEN}`,
  },
});

Readable.fromWeb(res.body).pipe(fs.createWriteStream(asset.name));
