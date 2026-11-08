#!/usr/bin/env node
// Copyright 2026 MB AFKzona Group
// SPDX-License-Identifier: AGPL-3.0-only
import { runCli } from './run.js';

const code = await runCli(process.argv.slice(2), {
  cwd: process.cwd(),
  out: (s) => process.stdout.write(s),
  err: (s) => process.stderr.write(s),
  env: process.env,
});
process.exitCode = code;
