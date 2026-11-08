// Copyright 2026 MB AFKzona Group
// SPDX-License-Identifier: AGPL-3.0-only
import { chromium, type Browser, type Page } from 'playwright-core';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { checkPage, formatViolations, kerbcutMatchers } from '../src/playwright/index.js';

let browser: Browser;
let page: Page;

beforeAll(async () => {
  browser = await chromium.launch({ headless: true });
  page = await browser.newPage();
});
afterAll(async () => {
  await browser.close();
});

const BAD = '<!doctype html><html><head><title>t</title></head><body><main><img src="data:image/gif;base64,R0lGODlhAQABAAAAACw="><button></button></main></body></html>';
const GOOD = '<!doctype html><html lang="en"><head><title>t</title></head><body><main><h1>Fine</h1><p>Text</p></main></body></html>';

describe('Playwright helper', () => {
  it('checkPage reports violations with WCAG and EN 301 549 references', async () => {
    await page.setContent(BAD);
    const r = await checkPage(page);
    const ids = r.violations.map((v) => v.ruleId);
    expect(ids).toEqual(expect.arrayContaining(['image-alt', 'button-name', 'html-has-lang']));
    expect(r.violations.find((v) => v.ruleId === 'image-alt')?.en301549).toEqual(['9.1.1.1']);
    expect(formatViolations(r)).toContain('Automated testing finds only part of accessibility issues.');
  });
  it('can ignore rules and filter by impact', async () => {
    await page.setContent(BAD);
    const r = await checkPage(page, { ignoreRules: ['image-alt'], minImpact: 'critical' });
    expect(r.violations.map((v) => v.ruleId)).not.toContain('image-alt');
    expect(r.violations.every((v) => v.impact === 'critical')).toBe(true);
  });
  it('adds the Kerbcut language check when axe-core does not report it', async () => {
    await page.setContent('<!doctype html><html lang="en"><head><title>t</title></head><body><main>x</main></body></html>');
    await page.evaluate(() => {
      document.documentElement.setAttribute('lang', 'not a tag');
    });
    const r = await checkPage(page);
    expect(r.violations.some((v) => v.ruleId === 'html-lang-valid' || v.ruleId === 'kerbcut-page-lang')).toBe(true);
  });
  it('runs the focus heuristic on request', async () => {
    await page.setContent('<!doctype html><html lang="en"><head><title>t</title><style>a:focus,a:focus-visible{outline:none}</style></head><body><main><a href="#x">one</a><a href="#y">two</a></main></body></html>');
    const r = await checkPage(page, { focusHeuristic: true });
    expect(r.needsReview.find((f) => f.ruleId === 'kerbcut-focus-visible')?.nodeCount).toBe(2);
  });
  it('toHaveNoEaaViolations passes and fails with a readable message', async () => {
    await page.setContent(GOOD);
    const ok = await kerbcutMatchers.toHaveNoEaaViolations.call(undefined, page);
    expect(ok.pass).toBe(true);
    expect(ok.message()).toContain('found none');
    await page.setContent(BAD);
    const bad = await kerbcutMatchers.toHaveNoEaaViolations.call(undefined, page);
    expect(bad.pass).toBe(false);
    expect(bad.name).toBe('toHaveNoEaaViolations');
    expect(bad.message()).toContain('image-alt');
    expect(bad.message()).toContain('EN 301 549 9.1.1.1');
  });
  it('ignores fake results from a hostile page', async () => {
    await page.setContent(GOOD);
    await page.evaluate(() => {
      // A page that pretends to be axe-core and returns invented rule ids.
      Object.defineProperty(window, 'axe', {
        configurable: false,
        get: () => ({ run: () => Promise.resolve({ violations: [{ id: '<script>x</script>', nodes: [] }, { id: 'image-alt', impact: 'bogus', nodes: [{ target: ['a'.repeat(5000)], html: 'h'.repeat(5000) }] }], incomplete: 'nope', passes: -5, inapplicable: 1e9 }) }),
        set: () => undefined,
      });
    });
    const r = await checkPage(page);
    expect(r.violations.map((v) => v.ruleId)).toEqual(['image-alt']);
    expect(r.violations[0]?.impact).toBeUndefined();
    expect(r.violations[0]?.nodes[0]?.target[0]?.length).toBeLessThanOrEqual(300);
    expect(r.violations[0]?.nodes[0]?.html.length).toBeLessThanOrEqual(300);
    expect(r.violations[0]?.help).toBe('Images must have alternative text');
  });
});
