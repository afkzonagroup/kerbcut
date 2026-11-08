// Copyright 2026 MB AFKzona Group
// SPDX-License-Identifier: AGPL-3.0-only
//
// Helpers for existing Playwright test suites. They check the page a test
// has already opened; they do not navigate and do not fetch anything, so the
// crawler's SSRF guard is not involved. The page must be one your test
// controls.
//
//   import { expect as base } from '@playwright/test';
//   import { kerbcutMatchers } from '@afkzona/kerbcut/playwright';
//   const expect = base.extend(kerbcutMatchers);
//   await expect(page).toHaveNoEaaViolations();
import type { Page } from 'playwright-core';
import { DEFAULT_EN301549_VERSION, type En301549Version } from '../mapping/index.js';
import type { Finding, Impact } from '../report/schema.js';
import { runAxe } from '../scan/axe.js';
import { focusVisibleHeuristic, pageLanguageFinding, readPageLanguage } from '../scan/checks.js';
import { axeTagsFor } from '../scan/options.js';

/** Options for checkPage() and the matcher. */
export interface CheckPageOptions {
  /** Also run WCAG 2.2 A/AA rules. */
  readonly wcag22?: boolean;
  readonly en301549Version?: En301549Version;
  /** Rule ids to ignore, for known and tracked issues. */
  readonly ignoreRules?: readonly string[];
  /** Only fail on these impacts and above (default: all). */
  readonly minImpact?: Impact;
  /** Run the focus-visible heuristic (moves focus with Tab; default false). */
  readonly focusHeuristic?: boolean;
  /** Elements stored per rule (default 20). */
  readonly maxNodesPerRule?: number;
}

/** Result for one page. */
export interface PageCheckResult {
  readonly url: string;
  readonly violations: readonly Finding[];
  readonly needsReview: readonly Finding[];
}

const ORDER: readonly Impact[] = ['minor', 'moderate', 'serious', 'critical'];

/** Runs axe-core (WCAG 2.1 A/AA) and the Kerbcut page checks on the current page. */
export async function checkPage(page: Page, options: CheckPageOptions = {}): Promise<PageCheckResult> {
  const version = options.en301549Version ?? DEFAULT_EN301549_VERSION;
  const axe = await runAxe(page, { tags: axeTagsFor(options.wcag22 === true), maxNodes: options.maxNodesPerRule ?? 20, en301549Version: version });
  const violations: Finding[] = [...axe.violations];
  if (!violations.some((v) => v.ruleId === 'html-has-lang' || v.ruleId === 'html-lang-valid')) {
    const lang = pageLanguageFinding(await readPageLanguage(page), version);
    if (lang) violations.push(lang);
  }
  const needsReview: Finding[] = [...axe.incomplete];
  if (options.focusHeuristic === true) {
    const f = await focusVisibleHeuristic(page, 30, version);
    if (f) needsReview.push(f);
  }
  const ignore = new Set(options.ignoreRules ?? []);
  const min = ORDER.indexOf(options.minImpact ?? 'minor');
  const keep = (f: Finding): boolean => !ignore.has(f.ruleId) && (f.impact === undefined || ORDER.indexOf(f.impact) >= min);
  return { url: page.url(), violations: violations.filter(keep), needsReview };
}

/** Formats violations for a test failure message. */
export function formatViolations(result: PageCheckResult): string {
  const lines = [`${result.violations.length} accessibility violation(s) on ${result.url}:`];
  for (const v of result.violations) {
    lines.push(`- ${v.ruleId} [${v.impact ?? 'n/a'}] ${v.help} | WCAG ${v.wcag.join(', ') || 'none'} | EN 301 549 ${v.en301549.join(', ') || 'none'} | ${v.nodeCount} element(s)`);
    for (const n of v.nodes.slice(0, 5)) lines.push(`    ${n.target.join(' > ')}`);
  }
  lines.push('Automated testing finds only part of accessibility issues.');
  return lines.join('\n');
}

/** Result shape Playwright's expect.extend() expects. */
export interface MatcherResult {
  readonly pass: boolean;
  readonly message: () => string;
  readonly name: string;
  readonly expected?: unknown;
  readonly actual?: unknown;
}

/** Custom matchers for Playwright's expect.extend(). */
export const kerbcutMatchers = {
  /** Passes when axe-core and the Kerbcut checks find no violations on the page. */
  async toHaveNoEaaViolations(this: { isNot?: boolean } | undefined, page: Page, options: CheckPageOptions = {}): Promise<MatcherResult> {
    const result = await checkPage(page, options);
    const pass = result.violations.length === 0;
    return {
      pass,
      name: 'toHaveNoEaaViolations',
      expected: 0,
      actual: result.violations.length,
      message: () => (pass ? `expected violations on ${result.url}, found none` : formatViolations(result)),
    };
  },
};
