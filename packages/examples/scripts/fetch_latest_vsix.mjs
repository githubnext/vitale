#!/usr/bin/env node

import { Octokit } from "@octokit/core";
import { Readable } from "node:stream";
import * as fs from "node:fs";

const octokit = new Octokit({ auth: process.env.GITHUB_TOKEN });

const runs = await octokit.request(
  "GET /repos/{owner}/{repo}/actions/workflows/{workflow_id}/runs",
  {
    owner: "githubnext",
    repo: "vitale",
    workflow_id: "vsix.yml",
    per_page: 1,
  }
);

const artifacts = await octokit.request(
  "GET /repos/{owner}/{repo}/actions/runs/{run_id}/artifacts",
  {
    owner: "githubnext",
    repo: "vitale",
    run_id: runs.data.workflow_runs[0].id,
  }
);

const res = await fetch(artifacts.data.artifacts[0].archive_download_url, {
  headers: {
    Authorization: `Bearer ${process.env.GITHUB_TOKEN}`,
  },
});

Readable.fromWeb(res.body).pipe(fs.createWriteStream("latest-vsix.zip"));
