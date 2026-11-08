// Copyright 2026 MB AFKzona Group
// SPDX-License-Identifier: AGPL-3.0-only
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { accessibilityInfoCheck, countByPrinciple, summarizeByCriterion } from '../src/report/build.js';
import { renderHtmlReport, renderJsonReport } from '../src/report/html.js';
import { AUTOMATED_TESTING_DISCLAIMER, REPORT_SCHEMA_VERSION } from '../src/report/schema.js';
import { validateAgainstSchema } from './helpers/json-schema.js';
import { EVIL, evilReport, finding, page, report } from './helpers/fixtures.js';

describe('report summaries', () => {
  it('counts by principle, impact and criterion', () => {
    const r = report([
      page({ violations: [finding(), finding({ ruleId: 'link-name', impact: 'serious', wcag: ['2.4.4', '4.1.2'], en301549: ['9.2.4.4', '9.4.1.2'], nodeCount: 3 })] }),
      page({ url: 'https://shop.example/b', violations: [finding({ nodeCount: 1 })] }),
    ]);
    expect(r.summary.violations).toEqual({ findings: 3, nodes: 6 });
    expect(r.summary.byPrinciple.perceivable).toEqual({ findings: 2, nodes: 3 });
    expect(r.summary.byPrinciple.operable).toEqual({ findings: 1, nodes: 3 });
    expect(r.summary.byPrinciple.robust).toEqual({ findings: 1, nodes: 3 });
    expect(r.summary.byPrinciple.understandable).toEqual({ findings: 0, nodes: 0 });
    expect(r.summary.byImpact.critical).toEqual({ findings: 2, nodes: 3 });
    expect(r.summary.byImpact.serious).toEqual({ findings: 1, nodes: 3 });
    expect(r.summary.byCriterion.map((c) => [c.sc, c.en301549, c.findings, c.nodes, c.pages])).toEqual([
      ['1.1.1', '9.1.1.1', 2, 3, 2],
      ['2.4.4', '9.2.4.4', 1, 3, 1],
      ['4.1.2', '9.4.1.2', 1, 3, 1],
    ]);
    expect(r.schemaVersion).toBe(REPORT_SCHEMA_VERSION);
    expect(r.disclaimer).toBe(AUTOMATED_TESTING_DISCLAIMER);
    expect(r.standards).toMatchObject({ wcag: '2.1', levels: ['A', 'AA'], en301549Version: 'V3.2.1' });
  });
  it('a finding with two criteria under one principle counts once for that principle', () => {
    const c = countByPrinciple([finding({ wcag: ['1.1.1', '1.3.1'] })]);
    expect(c.perceivable).toEqual({ findings: 1, nodes: 2 });
  });
  it('ignores AAA and unknown criteria in the criterion summary', () => {
    const s = summarizeByCriterion([page({ violations: [finding({ wcag: ['2.1.3', '9.9.9'] })] })], 'V3.2.1');
    expect(s).toEqual([]);
  });
  it('reports the accessibility information link check', () => {
    expect(accessibilityInfoCheck([page()]).outcome).toBe('not-found');
    const found = accessibilityInfoCheck([page({ accessibilityInfoLinks: ['https://shop.example/accessibility'] })]);
    expect(found).toMatchObject({ outcome: 'found', heuristic: true, links: ['https://shop.example/accessibility'] });
  });
  it('produces JSON that matches schema/report.schema.json', () => {
    const schema = JSON.parse(readFileSync(new URL('../schema/report.schema.json', import.meta.url), 'utf8')) as unknown;
    for (const r of [report(), evilReport()]) {
      const json = JSON.parse(renderJsonReport(r)) as unknown;
      expect(validateAgainstSchema(schema, json)).toEqual([]);
    }
  });
  it('the schema file states the current report version', () => {
    const schema = JSON.parse(readFileSync(new URL('../schema/report.schema.json', import.meta.url), 'utf8')) as { properties: { schemaVersion: { const: string } } };
    expect(schema.properties.schemaVersion.const).toBe(REPORT_SCHEMA_VERSION);
  });
});

describe('HTML report', () => {
  const out = renderHtmlReport(evilReport());

  it('escapes every value', () => {
    expect(out).not.toContain('<script');
    expect(out).not.toContain('<img');
    expect(out).not.toMatch(/<[^>]*\sonerror\s*=/i);
    expect(out).not.toContain('javascript:');
    expect(out).toContain('&lt;script&gt;alert(1)&lt;/script&gt;');
    expect(out).not.toContain(EVIL);
  });
  it('has no scripts, no external resources and a strict CSP with the style hash', () => {
    expect(out).not.toMatch(/<script|<link|<iframe|<img|<object|<embed/i);
    const plain = renderHtmlReport(report());
    expect(plain).not.toMatch(/<script|<link|<[^>]*\ssrc\s*=|@import|url\(/i);
    const css = /<style>([\s\S]*?)<\/style>/.exec(out)?.[1] ?? '';
    const hash = createHash('sha256').update(css, 'utf8').digest('base64');
    expect(out).toContain(`default-src &#39;none&#39;; style-src &#39;sha256-${hash}&#39;`);
    expect(out.match(/<style>/g)).toHaveLength(1);
    expect(out).not.toMatch(/style="/);
  });
  it('states the limits of automated testing and carries the attribution footer', () => {
    const plain = renderHtmlReport(report());
    expect(plain).toContain('Automated testing finds only part of accessibility issues.');
    expect(plain).toContain('<a href="https://github.com/afkzonagroup/kerbcut" rel="noopener noreferrer">Kerbcut by AFKzona Group</a>');
    expect(plain).toContain('Not legal advice');
  });
  it('summarises by principle and by page, and links rule help only for https URLs', () => {
    const plain = renderHtmlReport(report());
    expect(plain).toContain('Violations by WCAG principle');
    expect(plain).toContain('1. Perceivable');
    expect(plain).toContain('<caption>Pages</caption>');
    expect(plain).toContain('href="https://dequeuniversity.com/rules/axe/4.14/image-alt"');
    expect(plain).toContain('href="https://www.w3.org/TR/WCAG21/#non-text-content"');
    expect(plain).toContain('<html lang="en">');
  });
});
