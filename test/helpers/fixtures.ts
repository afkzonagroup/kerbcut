// Copyright 2026 MB AFKzona Group
// SPDX-License-Identifier: AGPL-3.0-only
import { buildReport } from '../../src/report/build.js';
import type { Finding, PageReport, ScanReport } from '../../src/report/schema.js';
import { DEFAULT_LIMITS } from '../../src/scan/options.js';

/** Strings an attacker could put into a page, a URL or a selector. */
export const EVIL = `"><script>alert(1)</script><img src=x onerror=alert(2)>'\`{{x}}`;

export function finding(over: Partial<Finding> = {}): Finding {
  return {
    ruleId: 'image-alt',
    source: 'axe',
    impact: 'critical',
    help: 'Images must have alternative text',
    helpUrl: 'https://dequeuniversity.com/rules/axe/4.14/image-alt',
    wcag: ['1.1.1'],
    en301549: ['9.1.1.1'],
    heuristic: false,
    nodeCount: 2,
    nodes: [{ target: ['img'], html: '<img src="a.png">', summary: 'Fix this' }],
    ...over,
  };
}

export function page(over: Partial<PageReport> = {}): PageReport {
  return {
    url: 'https://shop.example/',
    finalUrl: 'https://shop.example/',
    depth: 0,
    status: 200,
    title: 'Shop',
    lang: 'en',
    violations: [finding()],
    needsReview: [],
    passedRules: 10,
    inapplicableRules: 20,
    accessibilityInfoLinks: [],
    blockedRequests: [],
    ...over,
  };
}

export function report(pages: PageReport[] = [page()]): ScanReport {
  return buildReport({
    startUrl: 'https://shop.example/',
    startedAt: new Date('2026-11-08T10:00:00Z'),
    finishedAt: new Date('2026-11-08T10:01:00Z'),
    respectRobotsTxt: true,
    limits: DEFAULT_LIMITS,
    axeTags: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'],
    browser: 'Chromium test',
    en301549Version: 'V3.2.1',
    pages,
    skipped: [{ url: 'https://shop.example/private', reason: 'robots' }],
  });
}

/** A report full of hostile values in every string field. */
export function evilReport(): ScanReport {
  const f = finding({
    ruleId: EVIL,
    help: EVIL,
    helpUrl: `javascript:alert(3)//${EVIL}`,
    nodes: [{ target: [EVIL, EVIL], html: EVIL, summary: EVIL }],
  });
  return buildReport({
    startUrl: `https://shop.example/${encodeURIComponent(EVIL)}`,
    startedAt: new Date('2026-11-08T10:00:00Z'),
    finishedAt: new Date('2026-11-08T10:01:00Z'),
    respectRobotsTxt: false,
    limits: DEFAULT_LIMITS,
    axeTags: ['wcag2a'],
    browser: EVIL,
    en301549Version: 'V3.2.1',
    pages: [
      page({
        url: `https://shop.example/?q=${EVIL}`,
        finalUrl: EVIL,
        title: EVIL,
        lang: EVIL,
        error: EVIL,
        warnings: [EVIL],
        violations: [f],
        needsReview: [f],
        accessibilityInfoLinks: [`https://shop.example/${EVIL}`],
        blockedRequests: [{ url: EVIL, reason: EVIL }],
      }),
    ],
    skipped: [{ url: EVIL, reason: 'error', detail: EVIL }],
    stoppedEarly: EVIL,
  });
}
