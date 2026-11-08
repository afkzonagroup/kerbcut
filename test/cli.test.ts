// Copyright 2026 MB AFKzona Group
// SPDX-License-Identifier: AGPL-3.0-only
import { mkdtemp, mkdir, readFile, rm, stat, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { parseCommand, UsageError } from '../src/cli/args.js';
import { failOnMatched, runCli, type Io } from '../src/cli/run.js';
import type { ScanOptions } from '../src/scan/options.js';
import { TOOL_VERSION } from '../src/version.js';
import { page, report } from './helpers/fixtures.js';
import { annexVBase, statementBase } from './helpers/configs.js';

let dir: string;
let out: string;
let err: string;
let lastScan: ScanOptions | undefined;

function io(over: Partial<Io> = {}): Io {
  return {
    cwd: dir,
    out: (s) => (out += s),
    err: (s) => (err += s),
    scan: (o) => {
      lastScan = o;
      return Promise.resolve(report());
    },
    ...over,
  };
}

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'kerbcut-cli-'));
  out = '';
  err = '';
  lastScan = undefined;
});
afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

describe('argument parsing', () => {
  it('parses scan options with safe defaults', () => {
    const c = parseCommand(['scan', 'https://shop.example/']);
    expect(c).toMatchObject({
      kind: 'scan',
      url: 'https://shop.example/',
      respectRobotsTxt: true,
      allowedPorts: [80, 443],
      allowPost: false,
      failOn: 'none',
      unsafeAllowLoopbackForTesting: false,
      en301549Version: 'V3.2.1',
    });
  });
  it('converts limits', () => {
    const c = parseCommand(['scan', 'https://a.example/', '--max-pages', '7', '--max-depth', '0', '--timeout', '60', '--page-timeout', '10', '--max-response-mb', '2']);
    expect(c.kind === 'scan' && c.limits).toEqual({ maxPages: 7, maxDepth: 0, totalTimeMs: 60_000, pageTimeoutMs: 10_000, maxResponseBytes: 2 * 1024 * 1024 });
  });
  it('enables loopback only with the clearly named flag', () => {
    expect(parseCommand(['scan', 'http://127.0.0.1/', '--unsafe-allow-loopback-for-testing'])).toMatchObject({ unsafeAllowLoopbackForTesting: true });
    expect(() => parseCommand(['scan', 'http://127.0.0.1/', '--allow-loopback'])).toThrow(UsageError);
    expect(() => parseCommand(['scan', 'http://127.0.0.1/', '--unsafe'])).toThrow(UsageError);
  });
  it.each([
    [['scan']],
    [['scan', 'a', 'b']],
    [['scan', 'https://a.example/', '--max-pages', '0']],
    [['scan', 'https://a.example/', '--max-pages', '5000']],
    [['scan', 'https://a.example/', '--max-pages', '1e3']],
    [['scan', 'https://a.example/', '--allow-port', '70000']],
    [['scan', 'https://a.example/', '--fail-on', 'maybe']],
    [['scan', 'https://a.example/', '--en301549', 'V9']],
    [['annex-v']],
    [['annex-v', '--config', 'c.json']],
    [['statement', '--list-choices']],
    [['statement', '--list-choices', '--lang', 'en', '--status', 'x']],
    [['annex-v', '--config', 'c.json', '--out-md', 'a.md', '--lang', 'en']],
    [['nope']],
  ])('rejects %j', (argv) => {
    expect(() => parseCommand(argv)).toThrow(UsageError);
  });
  it('parses the other commands', () => {
    expect(parseCommand([])).toEqual({ kind: 'help' });
    expect(parseCommand(['--version'])).toEqual({ kind: 'version' });
    expect(parseCommand(['mapping', '--json'])).toEqual({ kind: 'mapping', json: true, en301549Version: 'V3.2.1' });
    expect(parseCommand(['statement', '--list-choices', '--lang', 'de'])).toEqual({ kind: 'statement-choices', lang: 'de', status: 'partial' });
    expect(parseCommand(['scan', 'https://a.example/', '--allow-port', '8080', '--allow-port', '443'])).toMatchObject({ allowedPorts: [80, 443, 8080] });
  });
});

describe('running the CLI', () => {
  it('prints help and version', async () => {
    expect(await runCli(['--help'], io())).toBe(0);
    expect(out).toContain('Usage:');
    out = '';
    expect(await runCli(['--version'], io())).toBe(0);
    expect(out.trim()).toBe(TOOL_VERSION);
  });
  it('returns 2 with the help text on usage errors', async () => {
    expect(await runCli(['scan'], io())).toBe(2);
    expect(err).toContain('scan needs exactly one URL');
  });
  it('scans, writes reports inside the working directory and applies --fail-on', async () => {
    const code = await runCli(['scan', 'https://shop.example/', '--out-json', 'r.json', '--out-html', 'r.html', '--quiet'], io());
    expect(code).toBe(0);
    expect(lastScan).toMatchObject({ startUrl: 'https://shop.example/', unsafeAllowLoopbackForTesting: false, respectRobotsTxt: true });
    expect(lastScan?.onProgress).toBeUndefined();
    const json = JSON.parse(await readFile(join(dir, 'r.json'), 'utf8')) as { schemaVersion: string };
    expect(json.schemaVersion).toBe('1.0.0');
    expect(await readFile(join(dir, 'r.html'), 'utf8')).toContain('Kerbcut by AFKzona Group');
    expect(out).toContain('Automated testing finds only part of accessibility issues.');
    expect(await runCli(['scan', 'https://shop.example/', '--fail-on', 'violations'], io())).toBe(1);
    expect(await runCli(['scan', 'https://shop.example/', '--fail-on', 'serious'], io())).toBe(1);
  });
  it('warns loudly when the test-only loopback flag is used', async () => {
    await runCli(['scan', 'http://127.0.0.1/', '--unsafe-allow-loopback-for-testing'], io());
    expect(err).toContain('WARNING: --unsafe-allow-loopback-for-testing');
    expect(lastScan?.unsafeAllowLoopbackForTesting).toBe(true);
  });
  it('runs Chromium with its sandbox unless the flag or KERBCUT_BROWSER_SANDBOX=off turns it off', async () => {
    expect(await runCli(['scan', 'https://shop.example/'], io())).toBe(0);
    expect(lastScan?.browserSandbox).toBe(true);
    expect(err).not.toContain('without its sandbox');
    expect(await runCli(['scan', 'https://shop.example/', '--no-browser-sandbox'], io())).toBe(0);
    expect(lastScan?.browserSandbox).toBe(false);
    expect(err).toContain('Chromium runs without its sandbox');
    expect(await runCli(['scan', 'https://shop.example/'], io({ env: { KERBCUT_BROWSER_SANDBOX: 'off' } }))).toBe(0);
    expect(lastScan?.browserSandbox).toBe(false);
    expect(await runCli(['scan', 'https://shop.example/'], io({ env: { KERBCUT_BROWSER_SANDBOX: 'on' } }))).toBe(0);
    expect(lastScan?.browserSandbox).toBe(true);
  });
  it('refuses output paths outside the working directory and through symbolic links', async () => {
    expect(await runCli(['scan', 'https://shop.example/', '--out-json', '../escape.json'], io())).toBe(2);
    expect(err).toContain('outside the working directory');
    expect(lastScan).toBeUndefined();
    const outside = await mkdtemp(join(tmpdir(), 'kerbcut-outside-'));
    try {
      await symlink(outside, join(dir, 'link-dir'));
      expect(await runCli(['scan', 'https://shop.example/', '--out-json', 'link-dir/x.json'], io())).toBe(2);
      expect(await runCli(['scan', 'https://shop.example/', '--out-json', 'link-dir/new/x.json'], io())).toBe(2);
      await expect(readFile(join(outside, 'new', 'x.json'))).rejects.toThrow();
      // Refused before any directory is created through the link.
      await expect(stat(join(outside, 'new'))).rejects.toThrow();
      await writeFile(join(outside, 'target.json'), 'keep');
      await symlink(join(outside, 'target.json'), join(dir, 'link.json'));
      expect(await runCli(['scan', 'https://shop.example/', '--out-json', 'link.json'], io())).toBe(2);
      expect(await readFile(join(outside, 'target.json'), 'utf8')).toBe('keep');
      expect(await runCli(['scan', 'https://shop.example/', '--out-json', join(outside, 'ok.json'), '--allow-write-outside-cwd'], io())).toBe(0);
    } finally {
      await rm(outside, { recursive: true, force: true });
    }
    expect(await runCli(['scan', 'https://shop.example/', '--out-json', 'new-dir/sub/x.json'], io())).toBe(0);
    expect(JSON.parse(await readFile(join(dir, 'new-dir/sub/x.json'), 'utf8'))).toHaveProperty('schemaVersion');
    expect(await runCli(['scan', 'https://shop.example/', '--out-json', 'a\0b'], io())).toBe(2);
  });
  it('returns 3 when the scan cannot run, without a stack trace', async () => {
    const code = await runCli(['scan', 'http://127.0.0.1/'], io({ scan: undefined }));
    expect(code).toBe(3);
    expect(err).toContain('the start URL is not allowed');
    expect(err).not.toMatch(/\n\s+at /);
    err = '';
    const code2 = await runCli(['scan', 'https://a.example/'], io({ scan: () => Promise.reject(new Error('boom\n    at secret.js:1')) }));
    expect(code2).toBe(3);
    expect(err).toContain('boom');
    expect(err).not.toContain('secret.js');
  });
  it('generates Annex V and statements from config files, with a scan report', async () => {
    await writeFile(join(dir, 'annex.json'), JSON.stringify(annexVBase));
    await writeFile(join(dir, 'statement.json'), JSON.stringify(statementBase));
    await writeFile(join(dir, 'report.json'), JSON.stringify(report()));
    expect(await runCli(['annex-v', '--config', 'annex.json', '--report', 'report.json', '--out-md', 'a.md', '--out-html', 'a.html'], io())).toBe(0);
    expect(await readFile(join(dir, 'a.md'), 'utf8')).toContain('# Accessibility information: Example Shop online store');
    expect(await runCli(['statement', '--config', 'statement.json', '--out-md', 's.md'], io())).toBe(0);
    expect(err).toContain('intro.1');
    expect(await readFile(join(dir, 's.md'), 'utf8')).toContain('# ACCESSIBILITY STATEMENT');
    await writeFile(join(dir, 'annex-bank.json'), JSON.stringify({ ...annexVBase, service: { ...annexVBase.service, category: 'consumer-banking' }, requirements: [annexVBase.requirements[0]] }));
    err = '';
    expect(await runCli(['annex-v', '--config', 'annex-bank.json', '--out-md', 'bank.md'], io())).toBe(0);
    expect(err).toContain('note: Annex I Section IV point (e) also applies to consumer-banking services');
    await writeFile(join(dir, 'annex-lt.json'), JSON.stringify({ ...annexVBase, language: 'lt' }));
    err = '';
    expect(await runCli(['annex-v', '--config', 'annex-lt.json', '--out-html', 'lt.html'], io())).toBe(0);
    expect(err).toContain('unreviewed translation');
  });
  it('reports config errors with exit code 2', async () => {
    await writeFile(join(dir, 'bad.json'), '{"language":"en"');
    expect(await runCli(['annex-v', '--config', 'bad.json', '--out-md', 'x.md'], io())).toBe(2);
    expect(err).toContain('config is not valid JSON');
    await writeFile(join(dir, 'bad2.json'), JSON.stringify({ ...annexVBase, extra: 1 }));
    expect(await runCli(['annex-v', '--config', 'bad2.json', '--out-md', 'x.md'], io())).toBe(2);
    expect(err).toContain('unknown property "extra"');
    await writeFile(join(dir, 'big.json'), ' '.repeat(1024 * 1024 + 1));
    expect(await runCli(['annex-v', '--config', 'big.json', '--out-md', 'x.md'], io())).toBe(2);
    expect(err).toContain('larger than');
    await mkdir(join(dir, 'a-dir'));
    expect(await runCli(['annex-v', '--config', 'a-dir', '--out-md', 'x.md'], io())).toBe(2);
    await writeFile(join(dir, 'report-bad.json'), JSON.stringify({ schemaVersion: '9.0.0' }));
    await writeFile(join(dir, 'annex.json'), JSON.stringify(annexVBase));
    expect(await runCli(['annex-v', '--config', 'annex.json', '--report', 'report-bad.json', '--out-md', 'x.md'], io())).toBe(2);
  });
  it('lists statement choices and prints the mapping', async () => {
    expect(await runCli(['statement', '--list-choices', '--lang', 'en', '--status', 'non'], io())).toBe(0);
    expect(out).toContain('status.1\t[This] [These]');
    out = '';
    expect(await runCli(['mapping'], io())).toBe(0);
    expect(out).toContain('image-alt\tWCAG 1.1.1\tEN 301 549 9.1.1.1');
    out = '';
    expect(await runCli(['mapping', '--json', '--en301549', 'V4.1.1'], io())).toBe(0);
    const m = JSON.parse(out) as { criteria: { sc: string; en301549: string | null }[] };
    expect(m.criteria.find((c) => c.sc === '4.1.1')?.en301549).toBeNull();
    expect(m.criteria.find((c) => c.sc === '2.5.8')?.en301549).toBe('9.2.5.8');
  });
  it('failOnMatched follows the levels', () => {
    const clean = report([page({ violations: [] })]);
    expect(failOnMatched(clean, 'violations')).toBe(false);
    expect(failOnMatched(report(), 'none')).toBe(false);
  });
});
