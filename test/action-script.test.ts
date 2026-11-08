// Copyright 2026 MB AFKzona Group
// SPDX-License-Identifier: AGPL-3.0-only
//
// Runs the shell script of the GitHub Action's scan step in bash, with a
// stub in place of the CLI, to check what reaches $GITHUB_OUTPUT.
// eslint-disable-next-line no-restricted-imports -- test only: runs the action's own constant script in bash; no user input reaches it
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

const action = await readFile(new URL('../action.yml', import.meta.url), 'utf8');

/** The "run: |" script of the step with the given name, dedented. */
function stepScript(name: string): string {
  const start = action.indexOf(`- name: ${name}\n`);
  const run = action.indexOf('run: |\n', start);
  const lines: string[] = [];
  for (const line of action.slice(run + 'run: |\n'.length).split('\n')) {
    if (line.trim() !== '' && !line.startsWith('        ')) break;
    lines.push(line.slice(8));
  }
  return lines.join('\n');
}

// Stands in for dist/cli/main.js: writes report.json to the --out-json path
// with the given findings value, then exits with the given code.
const STUB = `
const fs = require('fs');
const path = require('path');
const out = process.argv[process.argv.indexOf('--out-json') + 1];
if (process.env.STUB_WRITE === '1') {
  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(out, '{"summary":{"violations":{"findings":' + process.env.STUB_FINDINGS + '}}}');
}
process.exit(Number(process.env.STUB_CODE));
`;

let dir: string;
beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'kerbcut-action-'));
  await mkdir(join(dir, 'action', 'dist', 'cli'), { recursive: true });
  await writeFile(join(dir, 'action', 'dist', 'cli', 'main.js'), STUB);
  await writeFile(join(dir, 'action', 'package.json'), '{"type":"commonjs"}');
  await mkdir(join(dir, 'ws'));
});
afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

function runScan(env: Record<string, string>): { status: number | null; output: string } {
  const outputFile = join(dir, 'github-output');
  const r = spawnSync('bash', ['-c', stepScript('Scan')], {
    cwd: join(dir, 'ws'),
    encoding: 'utf8',
    env: {
      PATH: process.env.PATH ?? '',
      GITHUB_ACTION_PATH: join(dir, 'action'),
      GITHUB_OUTPUT: outputFile,
      KERBCUT_URL: 'https://www.example.com/',
      KERBCUT_MAX_PAGES: '1',
      KERBCUT_MAX_DEPTH: '0',
      KERBCUT_TIMEOUT: '60',
      KERBCUT_FAIL_ON: 'violations',
      KERBCUT_RESPECT_ROBOTS: 'true',
      KERBCUT_WCAG22: 'false',
      KERBCUT_REPORT_DIR: 'kerbcut-report',
      KERBCUT_SANDBOX_INPUT: 'true',
      STUB_WRITE: '1',
      STUB_FINDINGS: '3',
      STUB_CODE: '1',
      ...env,
    },
  });
  return { status: r.status, output: existsSync(outputFile) ? readFileSync(outputFile, 'utf8') : '' };
}

describe('GitHub Action scan step', () => {
  it('writes the outputs for a report from this run and keeps the exit code', () => {
    const r = runScan({});
    expect(r.status).toBe(1);
    expect(r.output).toBe('violations=3\nreport-json=kerbcut-report/report.json\n');
  });
  it('refuses a multi-line report-dir before anything runs', () => {
    const r = runScan({ KERBCUT_REPORT_DIR: 'kerbcut-report\nevil=1' });
    expect(r.status).toBe(2);
    expect(r.output).not.toContain('evil');
  });
  it('writes only a plain number as the violations output', () => {
    const r = runScan({ STUB_FINDINGS: '"1\\nevil=1"' });
    expect(r.status).not.toBe(0);
    expect(r.output).not.toContain('evil');
  });
  it('writes no outputs when the scan did not finish (stale report from an earlier run)', () => {
    const r = runScan({ STUB_CODE: '3' });
    expect(r.status).toBe(3);
    expect(r.output).toBe('');
  });
});
