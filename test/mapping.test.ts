// Copyright 2026 MB AFKzona Group
// SPDX-License-Identifier: AGPL-3.0-only
import { createRequire } from 'node:module';
import { describe, expect, it } from 'vitest';
import { AXE_RULES, AXE_RULES_VERSION } from '../src/data/axe-rules.generated.js';
import { EN301549_V3_2_1_CLAUSE9, EN301549_V4_1_1_CLAUSE9, EN301549_VERSIONS } from '../src/data/en301549.js';
import { WCAG21, WCAG22_ADDED_A_AA } from '../src/data/wcag.js';
import { en301549Clause, isKnownAxeRule, mapAxeRule, principleOf, wcag21AaRules, wcagCriterion, wcagUrl } from '../src/mapping/index.js';

const require = createRequire(import.meta.url);
const axe = require('axe-core') as { version: string; getRules(): { ruleId: string; tags: string[] }[] };

const A_AA = WCAG21.filter((c) => c.level !== 'AAA');

describe('WCAG 2.1 data', () => {
  it('has the 78 success criteria of WCAG 2.1, 50 of them at Level A or AA', () => {
    expect(WCAG21).toHaveLength(78);
    expect(A_AA).toHaveLength(50);
    expect(WCAG21.filter((c) => c.level === 'A')).toHaveLength(30);
    expect(WCAG21.filter((c) => c.level === 'AA')).toHaveLength(20);
    expect(new Set(WCAG21.map((c) => c.sc)).size).toBe(78);
  });
  it('lists the six WCAG 2.2 A/AA additions', () => {
    expect(WCAG22_ADDED_A_AA.map((c) => c.sc)).toEqual(['2.4.11', '2.5.7', '2.5.8', '3.2.6', '3.3.7', '3.3.8']);
  });
});

describe('EN 301 549 clause 9 mapping completeness', () => {
  it('every WCAG 2.1 Level A/AA success criterion maps to clause 9.<sc> in V3.2.1, with the same title', () => {
    for (const c of A_AA) {
      const clause = en301549Clause(c.sc, 'V3.2.1');
      expect(clause, c.sc).toBeDefined();
      expect(clause?.clause).toBe(`9.${c.sc}`);
      // Headings in the standard use sentence case; compare case-insensitively.
      expect(clause?.heading.toLowerCase().replace(/\s+/g, ' ')).toBe(c.title.toLowerCase().replace('color', 'colour').replace('prerecorded', 'pre-recorded'));
    }
  });
  it('V3.2.1 clause 9 has exactly the 50 A/AA requirements plus Void clauses for the AAA numbers in range', () => {
    const real = EN301549_V3_2_1_CLAUSE9.filter((c) => c.heading !== 'Void').map((c) => c.clause.slice(2));
    expect(real.sort()).toEqual(A_AA.map((c) => c.sc).sort());
    const voids = EN301549_V3_2_1_CLAUSE9.filter((c) => c.heading === 'Void').map((c) => c.clause);
    expect(voids).toEqual(['9.1.4.6', '9.1.4.7', '9.1.4.8', '9.1.4.9', '9.2.1.3']);
    for (const v of voids) expect(wcagCriterion(v.slice(2))?.level).toBe('AAA');
  });
  it('V4.1.1 maps the WCAG 2.2 additions and makes 4.1.1 Parsing Void', () => {
    for (const c of WCAG22_ADDED_A_AA) expect(en301549Clause(c.sc, 'V4.1.1')?.clause).toBe(`9.${c.sc}`);
    expect(en301549Clause('4.1.1', 'V4.1.1')).toBeUndefined();
    expect(en301549Clause('4.1.1', 'V3.2.1')?.heading).toBe('Parsing');
    for (const c of A_AA.filter((x) => x.sc !== '4.1.1')) expect(en301549Clause(c.sc, 'V4.1.1')?.clause, c.sc).toBe(`9.${c.sc}`);
    expect(EN301549_V4_1_1_CLAUSE9.filter((c) => c.heading !== 'Void')).toHaveLength(55);
  });
  it('AAA criteria have no EN 301 549 requirement', () => {
    for (const c of WCAG21.filter((x) => x.level === 'AAA')) expect(en301549Clause(c.sc), c.sc).toBeUndefined();
  });
  it('records the official status of both versions', () => {
    expect(EN301549_VERSIONS['V3.2.1'].status).toMatch(/2021\/1339/);
    expect(EN301549_VERSIONS['V3.2.1'].status).toMatch(/Not published in the Official Journal under Directive \(EU\) 2019\/882/);
    expect(EN301549_VERSIONS['V4.1.1'].status).toMatch(/does not yet give a presumption of conformity/);
  });
});

describe('axe-core rule mapping', () => {
  it('the generated rule data matches the installed axe-core', () => {
    expect(AXE_RULES_VERSION).toBe(axe.version);
    const live = axe.getRules().map((r) => r.ruleId).sort();
    expect(AXE_RULES.map((r) => r.id)).toEqual(live);
    for (const r of axe.getRules()) {
      const mine = AXE_RULES.find((x) => x.id === r.ruleId)!;
      const sc = r.tags
        .map((t) => /^wcag(\d)(\d)(\d{1,2})$/.exec(t))
        .filter((m): m is RegExpExecArray => m !== null)
        .map((m) => `${m[1]}.${m[2]}.${m[3]}`)
        .sort();
      expect(mine.sc, r.ruleId).toEqual(sc);
    }
  });
  it('every rule run for WCAG 2.1 A/AA maps to at least one A/AA criterion and EN 301 549 clause', () => {
    const rules = wcag21AaRules();
    expect(rules.length).toBeGreaterThan(50);
    for (const r of rules) {
      const m = mapAxeRule(r.id)!;
      expect(m.wcag.length, r.id).toBeGreaterThan(0);
      expect(m.en301549.length, r.id).toBe(m.wcag.length);
      for (const sc of m.wcag) expect(wcagCriterion(sc), sc).toBeDefined();
    }
  });
  it("agrees with axe-core's own EN 301 549 tags for every A/AA criterion", () => {
    for (const r of wcag21AaRules()) {
      const m = mapAxeRule(r.id)!;
      for (const clause of m.en301549) expect(r.axeEnTags, r.id).toContain(clause);
    }
  });
  it('keeps AAA tags apart: scrollable-region-focusable is tagged 2.1.3 (AAA), EN 9.2.1.3 is Void', () => {
    const m = mapAxeRule('scrollable-region-focusable')!;
    expect(m.wcag).toEqual(['2.1.1']);
    expect(m.wcagAaa).toEqual(['2.1.3']);
    expect(m.en301549).toEqual(['9.2.1.1']);
  });
  it('maps WCAG 2.2 rules with V4.1.1 only', () => {
    const target = mapAxeRule('target-size', 'V4.1.1');
    expect(target?.en301549).toEqual(['9.2.5.8']);
    expect(mapAxeRule('target-size', 'V3.2.1')?.en301549).toEqual([]);
  });
  it('rejects unknown rule ids', () => {
    expect(mapAxeRule('made-up-rule')).toBeUndefined();
    expect(isKnownAxeRule('image-alt')).toBe(true);
    expect(isKnownAxeRule('__proto__')).toBe(false);
  });
});

describe('principles and links', () => {
  it('derives the principle from the first number', () => {
    expect(principleOf('1.1.1')).toBe('perceivable');
    expect(principleOf('2.4.7')).toBe('operable');
    expect(principleOf('3.1.1')).toBe('understandable');
    expect(principleOf('4.1.2')).toBe('robust');
    expect(principleOf('5.1.1')).toBeUndefined();
  });
  it('links to the W3C Recommendation', () => {
    expect(wcagUrl(wcagCriterion('1.4.3')!)).toBe('https://www.w3.org/TR/WCAG21/#contrast-minimum');
    expect(wcagUrl(wcagCriterion('2.5.8')!)).toBe('https://www.w3.org/TR/WCAG22/#target-size-minimum');
  });
});
