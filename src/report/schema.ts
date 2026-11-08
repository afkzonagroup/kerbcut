// Copyright 2026 MB AFKzona Group
// SPDX-License-Identifier: AGPL-3.0-only
//
// The JSON report format. It is versioned with semantic versioning:
// - patch: documentation only,
// - minor: new optional fields,
// - major: fields removed, renamed or changed in meaning.
// schema/report.schema.json describes the same format as JSON Schema.
import type { En301549Version, WcagPrinciple } from '../mapping/index.js';

/** Version of the report format. */
export const REPORT_SCHEMA_VERSION = '1.0.0';

/** axe-core impact levels. */
export type Impact = 'minor' | 'moderate' | 'serious' | 'critical';

/** One element a finding points at. */
export interface NodeRef {
  /** CSS selector path from axe-core (one entry per frame level). */
  readonly target: readonly string[];
  /** Start of the element's HTML, shortened. */
  readonly html: string;
  /** Why the element failed, from axe-core, shortened. */
  readonly summary?: string;
}

/** One rule result on one page. */
export interface Finding {
  readonly ruleId: string;
  /** "axe" for axe-core rules, "kerbcut" for this tool's own checks. */
  readonly source: 'axe' | 'kerbcut';
  readonly impact?: Impact;
  /** Short description of the rule. */
  readonly help: string;
  readonly helpUrl?: string;
  /** WCAG 2.x Level A/AA success criteria. */
  readonly wcag: readonly string[];
  /** EN 301 549 clause 9 numbers for the criteria. */
  readonly en301549: readonly string[];
  /** True when the check is a heuristic and needs a human to confirm it. */
  readonly heuristic: boolean;
  /** Number of elements affected (may be larger than nodes.length). */
  readonly nodeCount: number;
  readonly nodes: readonly NodeRef[];
}

/** Result for one page. */
export interface PageReport {
  readonly url: string;
  readonly finalUrl: string;
  readonly depth: number;
  readonly status?: number;
  readonly title?: string;
  /** Value of the lang attribute of the html element, if any. */
  readonly lang?: string;
  /** Set when the page could not be scanned. */
  readonly error?: string;
  /** Things worth knowing that did not stop the scan. */
  readonly warnings?: readonly string[];
  /** Rules that failed. */
  readonly violations: readonly Finding[];
  /** Results a person must review (axe-core "incomplete" and heuristics). */
  readonly needsReview: readonly Finding[];
  readonly passedRules: number;
  readonly inapplicableRules: number;
  /** Links on the page that look like an accessibility statement or accessibility information. */
  readonly accessibilityInfoLinks: readonly string[];
  /** Requests the page tried to make that the SSRF guard refused. */
  readonly blockedRequests: readonly { readonly url: string; readonly reason: string }[];
}

/** A URL that was found but not scanned. */
export interface SkippedUrl {
  readonly url: string;
  readonly reason: 'robots' | 'limit-pages' | 'limit-time' | 'limit-depth' | 'not-html' | 'other-origin' | 'blocked' | 'error';
  readonly detail?: string;
}

/** Counts of violations. */
export interface Counts {
  /** Rule failures, counted once per rule per page. */
  readonly findings: number;
  /** Affected elements. */
  readonly nodes: number;
}

/** Summary per WCAG success criterion. */
export interface CriterionSummary extends Counts {
  readonly sc: string;
  readonly title: string;
  readonly level: 'A' | 'AA';
  readonly principle: WcagPrinciple;
  readonly en301549?: string;
  readonly pages: number;
}

/** Site-level check. */
export interface SiteCheck {
  readonly id: 'accessibility-information-link';
  readonly outcome: 'found' | 'not-found';
  readonly heuristic: true;
  readonly detail: string;
  readonly links: readonly string[];
}

/** The whole report. */
export interface ScanReport {
  readonly schemaVersion: string;
  readonly tool: {
    readonly name: string;
    readonly version: string;
    readonly url: string;
    readonly axeCoreVersion: string;
    readonly browser: string;
  };
  readonly scan: {
    readonly startUrl: string;
    readonly startedAt: string;
    readonly finishedAt: string;
    readonly durationMs: number;
    readonly respectRobotsTxt: boolean;
    readonly limits: Readonly<Record<string, number>>;
    readonly axeTags: readonly string[];
    readonly stoppedEarly?: string;
  };
  readonly standards: {
    readonly wcag: '2.1' | '2.2';
    readonly levels: readonly ['A', 'AA'];
    readonly en301549Version: En301549Version;
    readonly en301549Status: string;
  };
  readonly disclaimer: string;
  readonly summary: {
    readonly pagesScanned: number;
    readonly pagesWithErrors: number;
    readonly urlsSkipped: number;
    readonly violations: Counts;
    readonly needsReview: Counts;
    readonly byImpact: Readonly<Record<Impact, Counts>>;
    readonly byPrinciple: Readonly<Record<WcagPrinciple, Counts>>;
    readonly byCriterion: readonly CriterionSummary[];
  };
  readonly siteChecks: readonly SiteCheck[];
  readonly pages: readonly PageReport[];
  readonly skipped: readonly SkippedUrl[];
}

/** The statement every report carries. */
export const AUTOMATED_TESTING_DISCLAIMER =
  'Automated testing finds only part of accessibility issues. Many WCAG success criteria cannot be checked by a tool at all, and others only in part. A result without violations does not mean that a page is accessible or that a service meets Directive (EU) 2019/882. Manual testing by people, including people with disabilities and users of assistive technologies, is needed. This report is not legal advice.';
