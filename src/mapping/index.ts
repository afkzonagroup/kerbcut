// Copyright 2026 MB AFKzona Group
// SPDX-License-Identifier: AGPL-3.0-only
//
// Mapping between axe-core rules, WCAG success criteria and EN 301 549
// clause 9. The WCAG to EN 301 549 mapping is derived from the clause
// numbering of the standard itself (clause 9.x.y.z = WCAG x.y.z) and checked
// against the clause list read from the published standard.
import { AXE_RULES, AXE_RULES_VERSION } from '../data/axe-rules.generated.js';
import type { AxeRuleMeta } from '../data/axe-rules-types.js';
import {
  EN301549_V3_2_1_CLAUSE9,
  EN301549_V4_1_1_CLAUSE9,
  EN301549_VERSIONS,
  type En301549Clause,
  type En301549Version,
} from '../data/en301549.js';
import { WCAG21, WCAG21_URL, WCAG22_ADDED_A_AA, WCAG22_URL, type WcagCriterion, type WcagPrinciple } from '../data/wcag.js';

export type { En301549Version, WcagCriterion, WcagPrinciple };
export { EN301549_VERSIONS, WCAG21, WCAG22_ADDED_A_AA };

/** Version of EN 301 549 used for clause numbers in reports. */
export const DEFAULT_EN301549_VERSION: En301549Version = 'V3.2.1';

const BY_SC = new Map<string, WcagCriterion>([...WCAG21, ...WCAG22_ADDED_A_AA].map((c) => [c.sc, c]));
const CLAUSES: Readonly<Record<En301549Version, ReadonlyMap<string, En301549Clause>>> = {
  'V3.2.1': new Map(EN301549_V3_2_1_CLAUSE9.map((c) => [c.clause, c])),
  'V4.1.1': new Map(EN301549_V4_1_1_CLAUSE9.map((c) => [c.clause, c])),
};
const RULES = new Map<string, AxeRuleMeta>(AXE_RULES.map((r) => [r.id, r]));

/** Looks up a WCAG 2.1 (or WCAG 2.2 A/AA addition) success criterion. */
export function wcagCriterion(sc: string): WcagCriterion | undefined {
  return BY_SC.get(sc);
}

const PRINCIPLES: readonly WcagPrinciple[] = ['perceivable', 'operable', 'understandable', 'robust'];

/** The WCAG principle of a success criterion, from its first number. */
export function principleOf(sc: string): WcagPrinciple | undefined {
  const n = Number(sc.split('.')[0]);
  return PRINCIPLES[n - 1];
}

/** URL of a success criterion in the W3C Recommendation. */
export function wcagUrl(c: WcagCriterion): string {
  return `${c.since === '2.2' ? WCAG22_URL : WCAG21_URL}#${c.id}`;
}

/**
 * The EN 301 549 clause 9 requirement for a WCAG success criterion, or
 * undefined when the standard has no requirement for it (Level AAA criteria
 * are "Void" or absent; 4.1.1 is "Void" in V4.1.1).
 */
export function en301549Clause(sc: string, version: En301549Version = DEFAULT_EN301549_VERSION): En301549Clause | undefined {
  const c = CLAUSES[version].get(`9.${sc}`);
  if (!c || c.heading === 'Void') return undefined;
  return c;
}

/** Mapping of one axe-core rule. */
export interface RuleMapping {
  readonly ruleId: string;
  /** WCAG criteria at Level A or AA. */
  readonly wcag: readonly string[];
  /** Criteria the rule is tagged with that are Level AAA (no EN 301 549 requirement). */
  readonly wcagAaa: readonly string[];
  /** EN 301 549 clauses for the A/AA criteria. */
  readonly en301549: readonly string[];
  readonly en301549Version: En301549Version;
}

/** Maps an axe-core rule id. Unknown ids return undefined. */
export function mapAxeRule(ruleId: string, version: En301549Version = DEFAULT_EN301549_VERSION): RuleMapping | undefined {
  const rule = RULES.get(ruleId);
  if (!rule) return undefined;
  const wcag: string[] = [];
  const wcagAaa: string[] = [];
  const en: string[] = [];
  for (const sc of rule.sc) {
    const c = BY_SC.get(sc);
    if (!c) continue;
    if (c.level === 'AAA') {
      wcagAaa.push(sc);
      continue;
    }
    wcag.push(sc);
    const clause = en301549Clause(sc, version);
    if (clause) en.push(clause.clause);
  }
  return { ruleId, wcag, wcagAaa, en301549: en, en301549Version: version };
}

/** Is this a known axe-core rule id? */
export function isKnownAxeRule(ruleId: string): boolean {
  return RULES.has(ruleId);
}

/** axe-core version the rule metadata was generated from. */
export const MAPPED_AXE_VERSION = AXE_RULES_VERSION;

/** All rules axe-core tags with WCAG 2.0/2.1 Level A or AA. */
export function wcag21AaRules(): readonly AxeRuleMeta[] {
  return AXE_RULES.filter((r) => r.levelTags.some((t) => ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'].includes(t)));
}

/** Sources of the mapping, for reports and documentation. */
export const MAPPING_SOURCES = {
  wcag21: WCAG21_URL,
  wcag22: WCAG22_URL,
  en301549: EN301549_VERSIONS,
  axeCore: `axe-core ${AXE_RULES_VERSION} rule tags`,
} as const;
