// Copyright 2026 MB AFKzona Group
// SPDX-License-Identifier: AGPL-3.0-only
//
// Runs the README examples (examples/*.ts, checked to be identical to the
// README in connectors.test.ts).
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { chromium } from 'playwright-core';
import { describe, expect, it, vi } from 'vitest';
import { annexVExample } from '../examples/annex-v.js';
import { scanSite } from '../examples/scan-site.js';
import { statementExample } from '../examples/statement.js';
import { kerbcutMatchers } from '../src/playwright/index.js';
import { html, startServer } from './helpers/server.js';

describe('README examples', () => {
  it('scanSite writes both reports', async () => {
    const srv = await startServer({ '/': html('<!doctype html><html lang="en"><head><title>x</title></head><body><main><img src="data:image/gif;base64,R0lGODlhAQABAAAAACw="></main></body></html>') });
    const dir = await mkdtemp(join(tmpdir(), 'kerbcut-example-'));
    const log = vi.spyOn(console, 'log').mockImplementation(() => undefined);
    try {
      const v = await scanSite(`${srv.origin}/`, dir, { allowedPorts: [srv.port], unsafeAllowLoopbackForTesting: true });
      expect(v.findings).toBeGreaterThan(0);
      expect(await readFile(join(dir, 'report.html'), 'utf8')).toContain('Kerbcut by AFKzona Group');
      expect(log).toHaveBeenCalledWith(expect.stringContaining('WCAG 1.1.1 / EN 301 549 9.1.1.1'));
    } finally {
      log.mockRestore();
      await rm(dir, { recursive: true, force: true });
      await srv.close();
    }
  });
  it('annexVExample returns Markdown with the official Annex V text', () => {
    expect(annexVExample()).toContain('a general description of the service in accessible formats');
  });
  it('statementExample resolves all choices', () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => undefined);
    const r = statementExample();
    log.mockRestore();
    expect(r.unresolved).toEqual([]);
    expect(r.markdown).toContain('This website is partially compliant with EN 301 549 V3.2.1 (2021-03)');
  });
  it('the Playwright matcher follows the expect.extend protocol (checked with Vitest, which uses the same protocol)', async () => {
    expect.extend(kerbcutMatchers);
    const browser = await chromium.launch({ headless: true });
    try {
      const page = await browser.newPage();
      await page.setContent('<!doctype html><html lang="en"><head><title>t</title></head><body><main><h1>ok</h1></main></body></html>');
      await (expect(page) as unknown as { toHaveNoEaaViolations: () => Promise<void> }).toHaveNoEaaViolations();
      await page.setContent('<!doctype html><html><head><title>t</title></head><body><button></button></body></html>');
      await expect((expect(page) as unknown as { toHaveNoEaaViolations: () => Promise<void> }).toHaveNoEaaViolations()).rejects.toThrow(/button-name/);
    } finally {
      await browser.close();
    }
  });
});
