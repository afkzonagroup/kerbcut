// Copyright 2026 MB AFKzona Group
// SPDX-License-Identifier: AGPL-3.0-only
//
// Assembles the report and its summaries. Pure functions.
import { EN301549_VERSIONS, en301549Clause, principleOf, wcagCriterion, type En301549Version, type WcagPrinciple } from '../mapping/index.js';
import { AXE_VERSION } from '../scan/axe.js';
import type { ScanLimits } from '../scan/options.js';
import { TOOL_NAME, TOOL_URL, TOOL_VERSION } from '../version.js';
import {
  AUTOMATED_TESTING_DISCLAIMER,
  REPORT_SCHEMA_VERSION,
  type Counts,
  type CriterionSummary,
  type Finding,
  type Impact,
  type PageReport,
  type ScanReport,
  type SiteCheck,
  type SkippedUrl,
} from './schema.js';

/** Input for buildReport(). */
export interface ReportInput {
  readonly startUrl: string;
  readonly startedAt: Date;
  readonly finishedAt: Date;
  readonly respectRobotsTxt: boolean;
  readonly limits: ScanLimits;
  readonly axeTags: readonly string[];
  readonly browser: string;
  readonly en301549Version: En301549Version;
  readonly pages: readonly PageReport[];
  readonly skipped: readonly SkippedUrl[];
  readonly stoppedEarly?: string;
}

const ZERO: Counts = { findings: 0, nodes: 0 };

function add(a: Counts, f: Finding): Counts {
  return { findings: a.findings + 1, nodes: a.nodes + f.nodeCount };
}

/** Counts findings by impact. */
export function countByImpact(findings: readonly Finding[]): Record<Impact, Counts> {
  const out: Record<Impact, Counts> = { minor: ZERO, moderate: ZERO, serious: ZERO, critical: ZERO };
  for (const f of findings) if (f.impact) out[f.impact] = add(out[f.impact], f);
  return out;
}

/**
 * Counts findings by WCAG principle. A finding mapped to criteria under two
 * principles counts once for each principle.
 */
export function countByPrinciple(findings: readonly Finding[]): Record<WcagPrinciple, Counts> {
  const out: Record<WcagPrinciple, Counts> = { perceivable: ZERO, operable: ZERO, understandable: ZERO, robust: ZERO };
  for (const f of findings) {
    const principles = new Set(f.wcag.map(principleOf).filter((p): p is WcagPrinciple => p !== undefined));
    for (const p of principles) out[p] = add(out[p], f);
  }
  return out;
}

function scCompare(a: string, b: string): number {
  const pa = a.split('.').map(Number);
  const pb = b.split('.').map(Number);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const d = (pa[i] ?? 0) - (pb[i] ?? 0);
    if (d !== 0) return d;
  }
  return 0;
}

/** Summary per success criterion, over all pages, sorted by criterion number. */
export function summarizeByCriterion(pages: readonly PageReport[], version: En301549Version): CriterionSummary[] {
  const acc = new Map<string, { counts: Counts; pages: Set<string> }>();
  for (const page of pages) {
    for (const f of page.violations) {
      for (const sc of f.wcag) {
        const cur = acc.get(sc) ?? { counts: ZERO, pages: new Set<string>() };
        cur.counts = add(cur.counts, f);
        cur.pages.add(page.url);
        acc.set(sc, cur);
      }
    }
  }
  const out: CriterionSummary[] = [];
  for (const [sc, v] of acc) {
    const c = wcagCriterion(sc);
    const principle = principleOf(sc);
    if (!c || c.level === 'AAA' || !principle) continue;
    const clause = en301549Clause(sc, version);
    out.push({
      sc,
      title: c.title,
      level: c.level,
      principle,
      ...(clause ? { en301549: clause.clause } : {}),
      findings: v.counts.findings,
      nodes: v.counts.nodes,
      pages: v.pages.size,
    });
  }
  return out.sort((a, b) => scCompare(a.sc, b.sc));
}

/** Site-level heuristic: is there a link to accessibility information? */
export function accessibilityInfoCheck(pages: readonly PageReport[]): SiteCheck {
  const links = [...new Set(pages.flatMap((p) => p.accessibilityInfoLinks))].slice(0, 10);
  return links.length > 0
    ? {
        id: 'accessibility-information-link',
        outcome: 'found',
        heuristic: true,
        detail: 'Links that look like an accessibility statement or accessibility information were found. Check that the page they lead to contains the information Annex V of Directive (EU) 2019/882 requires (for services) or the statement Directive (EU) 2016/2102 requires (for public sector bodies).',
        links,
      }
    : {
        id: 'accessibility-information-link',
        outcome: 'not-found',
        heuristic: true,
        detail: 'No link that looks like an accessibility statement or accessibility information was found on the scanned pages. Directive (EU) 2019/882 Article 13(2) and Annex V require service providers to make information on how the service meets the accessibility requirements available to the public, in the general terms and conditions or an equivalent document. It may exist under a name this heuristic does not recognise.',
        links: [],
      };
}

/** Builds the full report. */
export function buildReport(input: ReportInput): ScanReport {
  const all = input.pages.flatMap((p) => p.violations);
  const review = input.pages.flatMap((p) => p.needsReview);
  const total = (fs: readonly Finding[]): Counts => fs.reduce(add, ZERO);
  const limits: Record<string, number> = { ...input.limits };
  return {
    schemaVersion: REPORT_SCHEMA_VERSION,
    tool: { name: TOOL_NAME, version: TOOL_VERSION, url: TOOL_URL, axeCoreVersion: AXE_VERSION, browser: input.browser },
    scan: {
      startUrl: input.startUrl,
      startedAt: input.startedAt.toISOString(),
      finishedAt: input.finishedAt.toISOString(),
      durationMs: input.finishedAt.getTime() - input.startedAt.getTime(),
      respectRobotsTxt: input.respectRobotsTxt,
      limits,
      axeTags: input.axeTags,
      ...(input.stoppedEarly !== undefined ? { stoppedEarly: input.stoppedEarly } : {}),
    },
    standards: {
      wcag: input.axeTags.includes('wcag22aa') ? '2.2' : '2.1',
      levels: ['A', 'AA'],
      en301549Version: input.en301549Version,
      en301549Status: EN301549_VERSIONS[input.en301549Version].status,
    },
    disclaimer: AUTOMATED_TESTING_DISCLAIMER,
    summary: {
      pagesScanned: input.pages.filter((p) => p.error === undefined).length,
      pagesWithErrors: input.pages.filter((p) => p.error !== undefined).length,
      urlsSkipped: input.skipped.length,
      violations: total(all),
      needsReview: total(review),
      byImpact: countByImpact(all),
      byPrinciple: countByPrinciple(all),
      byCriterion: summarizeByCriterion(input.pages, input.en301549Version),
    },
    siteChecks: [accessibilityInfoCheck(input.pages)],
    pages: input.pages,
    skipped: input.skipped.slice(0, 5000),
  };
}
