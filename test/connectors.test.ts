// Copyright 2026 MB AFKzona Group
// SPDX-License-Identifier: AGPL-3.0-only
//
// Checks for the GitHub Action, GitLab template, Dockerfile, CI workflows,
// package metadata and README examples.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { parseCommand } from '../src/cli/args.js';
import { TOOL_VERSION } from '../src/version.js';

const read = (p: string): string => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');

/** Splits a shell command line with "double quoted" variables into words, substituting sample values. */
function words(cmd: string, vars: Record<string, string>): string[] {
  return [...cmd.matchAll(/"([^"]*)"|(\S+)/g)].map((m) => (m[1] ?? m[2] ?? '').replace(/\$\{?(\w+)\}?/g, (_x, v: string) => vars[v] ?? `<${v}>`));
}

describe('GitHub Action', () => {
  const action = read('action.yml');
  it('passes inputs only through environment variables', () => {
    const run = action.slice(action.indexOf('- name: Scan'), action.indexOf('- name: Upload report'));
    // Every "run: |" block in the action: no expression may be expanded into script text.
    for (const block of action.split(/\n\s+- /).filter((b) => b.includes('run: |'))) {
      expect(block.slice(block.indexOf('run: |'))).not.toMatch(/\$\{\{/);
    }
    expect(run).toContain('KERBCUT_URL: ${{ inputs.url }}');
  });
  it('builds a command the CLI accepts', () => {
    const line = /args=\(scan (.*)\)/.exec(action)?.[1] ?? '';
    const argv = ['scan', ...words(line, { KERBCUT_URL: 'https://www.example.com/', KERBCUT_MAX_PAGES: '25', KERBCUT_MAX_DEPTH: '3', KERBCUT_TIMEOUT: '300', KERBCUT_FAIL_ON: 'violations', KERBCUT_REPORT_DIR: 'kerbcut-report' }), '--ignore-robots', '--wcag22'];
    expect(parseCommand(argv)).toMatchObject({ kind: 'scan', url: 'https://www.example.com/', failOn: 'violations', outJson: 'kerbcut-report/report.json', respectRobotsTxt: false, wcag22: true });
  });
  it('pins every action by commit SHA', () => {
    for (const m of action.matchAll(/uses:\s*(\S+)/g)) expect(m[1]).toMatch(/@[0-9a-f]{40}$/);
  });
});

describe('GitLab CI template', () => {
  const tpl = read('ci/gitlab/kerbcut.gitlab-ci.yml');
  it('builds a command the CLI accepts', () => {
    const line = /node \/app\/dist\/cli\/main\.js (.*)/.exec(tpl)?.[1] ?? '';
    const argv = words(line, { KERBCUT_URL: 'https://www.example.com/', KERBCUT_MAX_PAGES: '25', KERBCUT_MAX_DEPTH: '3', KERBCUT_TIMEOUT: '300', KERBCUT_FAIL_ON: 'violations', KERBCUT_REPORT_DIR: 'kerbcut-report' });
    expect(parseCommand(argv)).toMatchObject({ kind: 'scan', url: 'https://www.example.com/', outHtml: 'kerbcut-report/report.html' });
  });
  it('quotes every variable', () => {
    const line = /node \/app\/dist\/cli\/main\.js (.*)/.exec(tpl)?.[1] ?? '';
    expect(line.replace(/"\$\w+(\/[\w.]+)?"/g, '')).not.toContain('$');
  });
});

describe('Dockerfile', () => {
  const df = read('Dockerfile');
  it('pins base images by digest and runs as a non-root user', () => {
    for (const m of df.matchAll(/^FROM (\S+)/gm)) expect(m[1]).toMatch(/@sha256:[0-9a-f]{64}$/);
    expect(df).toMatch(/^USER kerbcut$/m);
    expect(df.indexOf('USER kerbcut')).toBeGreaterThan(df.lastIndexOf('RUN '));
    expect(df).toContain('npm ci --ignore-scripts');
  });
});

describe('CI workflows', () => {
  for (const f of ['.github/workflows/ci.yml', '.github/workflows/codeql.yml']) {
    it(`${f} runs only on pull_request and workflow_dispatch, read-only, pinned`, () => {
      const wf = read(f);
      const on = wf.slice(wf.indexOf('\non:') + 1, wf.indexOf('\npermissions:'));
      expect(on.replace(/\s+/g, ' ').trim()).toBe('on: pull_request: workflow_dispatch:');
      expect(wf).not.toMatch(/schedule:|push:/);
      expect(wf).toMatch(/^permissions:\n {2}contents: read$/m);
      for (const m of wf.matchAll(/uses:\s*(\S+)/g)) expect(m[1]).toMatch(/@[0-9a-f]{40}$/);
    });
  }
});

describe('package metadata', () => {
  const pkg = JSON.parse(read('package.json')) as Record<string, unknown>;
  it('keeps the version in sync', () => {
    expect(pkg.version).toBe(TOOL_VERSION);
  });
  it('is provenance-ready, pinned and without install scripts', () => {
    expect(pkg.license).toBe('AGPL-3.0-only');
    expect(pkg.name).toBe('@afkzona/kerbcut');
    expect(pkg.engines).toEqual({ node: '>=22' });
    expect(pkg.repository).toBeDefined();
    expect(Array.isArray(pkg.files)).toBe(true);
    const scripts = pkg.scripts as Record<string, string>;
    for (const s of ['preinstall', 'install', 'postinstall', 'prepare']) expect(scripts[s]).toBeUndefined();
    for (const deps of [pkg.dependencies, pkg.devDependencies] as Record<string, string>[]) {
      for (const [name, v] of Object.entries(deps)) expect(v, name).toMatch(/^\d+\.\d+\.\d+$/);
    }
    expect(Object.keys(pkg.dependencies as object).sort()).toEqual(['axe-core', 'playwright-core']);
  });
});

describe('README examples', () => {
  const readme = read('README.md');
  const markers = [...readme.matchAll(/<!-- example: (examples\/[\w-]+\.ts) -->\n```ts\n([\s\S]*?)```/g)];
  it('has the three library examples, identical to the tested files', () => {
    expect(markers.map((m) => m[1])).toEqual(['examples/scan-site.ts', 'examples/annex-v.ts', 'examples/statement.ts']);
    for (const m of markers) expect(m[2], m[1]).toBe(read(m[1]!));
  });
});
