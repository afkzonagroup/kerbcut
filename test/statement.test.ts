// Copyright 2026 MB AFKzona Group
// SPDX-License-Identifier: AGPL-3.0-only
import { describe, expect, it } from 'vitest';
import { MODEL_STATEMENT, MODEL_STATEMENT_MISSING_LANGUAGES } from '../src/data/model-statement.generated.js';
import {
  buildStatementDoc,
  fillInstruction,
  generateStatement,
  listStatementChoices,
  parseStatementConfig,
  splitSentence,
  STATEMENT_LANGUAGES,
  type StatementConfig,
} from '../src/generators/statement.js';
import { statementBase } from './helpers/configs.js';
import { EVIL, page, report } from './helpers/fixtures.js';


const cfg = (over: Record<string, unknown> = {}): StatementConfig => parseStatementConfig({ ...statementBase, ...over });

/** Non-italic text outside brackets in a block: the fixed official wording. */
function fixedText(lang: string, block: number): string[] {
  const segs = MODEL_STATEMENT[lang]!.blocks[block]!;
  const text = segs.map((s) => (s.i === true ? '\u0001' : s.t)).join('');
  // Remove bracketed parts, then split on removed parts.
  let depth = 0;
  let out = '';
  for (const c of text) {
    if (c === '[') depth++;
    else if (c === ']') depth = Math.max(0, depth - 1);
    else if (depth === 0) out += c;
  }
  return out
    .split('\u0001')
    .map((s) => s.replace(/\s+/g, ' ').trim())
    .filter((s) => s.length >= 4);
}

describe('official model data', () => {
  it('has the 23 languages EUR-Lex publishes; Irish is not available', () => {
    expect(STATEMENT_LANGUAGES).toHaveLength(23);
    expect(STATEMENT_LANGUAGES).not.toContain('ga');
    expect(MODEL_STATEMENT_MISSING_LANGUAGES).toEqual(['ga']);
  });
  it('has the same 75-block structure in every language', () => {
    for (const lang of STATEMENT_LANGUAGES) {
      const m = MODEL_STATEMENT[lang]!;
      expect(m.source).toBe('official');
      expect(m.blocks, lang).toHaveLength(75);
      expect(m.url).toBe(`https://eur-lex.europa.eu/legal-content/${lang.toUpperCase()}/TXT/HTML/?uri=CELEX:32018D1523`);
      for (const i of [12, 14, 16, 20, 23, 26]) expect(m.blocks[i]!.map((s) => s.t).join('').trim(), `${lang} ${i}`).toMatch(/^\(?[\p{L}\d]{1,5}[.)]$/u);
    }
  });
});

describe('placeholder handling in every language', () => {
  it.each(STATEMENT_LANGUAGES)('%s: intro has the body name and legislation slots; every status sentence has the standard slot', (lang) => {
    const intro = splitSentence(MODEL_STATEMENT[lang]!.blocks[9]!, 'intro');
    expect(intro.flatMap((p) => (p.kind === 'slot' ? [p.slot] : []))).toEqual(['bodyName', 'legislation']);
    for (const b of [13, 15, 17]) {
      const parts = splitSentence(MODEL_STATEMENT[lang]!.blocks[b]!, 'status');
      expect(parts.flatMap((p) => (p.kind === 'slot' ? [p.slot] : [])), `${lang} ${b}`).toEqual(['standard']);
    }
    const reason = splitSentence(MODEL_STATEMENT[lang]!.blocks[21]!, 'reasonA');
    expect(reason.flatMap((p) => (p.kind === 'slot' ? [p.slot] : []))).toEqual(['legislationShort']);
  });
  it.each(STATEMENT_LANGUAGES)('%s: instructions for scope, date and last review are replaced', (lang) => {
    const b = MODEL_STATEMENT[lang]!.blocks;
    for (const [i, strip] of [
      [10, false],
      [31, false],
      [33, true],
    ] as const) {
      const out = fillInstruction(b[i]!, 'VALUE', { stripOtherBrackets: strip });
      expect(out, `${lang} ${i}`).toContain('VALUE');
      expect(out, `${lang} ${i}`).not.toMatch(/[[\]]/);
    }
  });
  it.each(STATEMENT_LANGUAGES)('%s: the generated statement keeps the fixed official wording verbatim', (lang) => {
    const out = generateStatement(cfg({ language: lang, disproportionateBurden: ['B'], outOfScope: ['C'], lastReviewedOn: '2026-11-09' }));
    const flat = out.markdown.replace(/\\/g, '').replace(/\s+/g, ' ');
    for (const block of [8, 11, 18, 19, 24, 27, 30, 34, 37]) {
      for (const piece of fixedText(lang, block)) expect(flat, `${lang} block ${block}: ${piece}`).toContain(piece.replace(/\s+/g, ' '));
    }
    expect(out.sources.template).toMatchObject({ source: 'official', celex: '32018D1523' });
    // Endnotes are deleted, as the model instructs.
    expect(flat).not.toContain(MODEL_STATEMENT[lang]!.blocks[62]!.map((s) => s.t).join('').trim());
  });
});

describe('statement output', () => {
  it('fills values and marks the grammatical alternatives it cannot choose', () => {
    const out = generateStatement(cfg());
    expect(out.markdown).toContain('Example City Council is committed to making its');
    expect(out.markdown).toContain('in accordance with the Act on the Accessibility of Public Sector Websites.');
    expect(out.markdown).toContain('This accessibility statement applies to the website https://city.example/.');
    expect(out.markdown).toContain('partially compliant with EN 301 549 V3.2.1 (2021-03)');
    expect(out.markdown).toContain('This statement was prepared on 2026-11-08.');
    expect(out.html).toContain('<mark>[This] [These] [website(s)] [mobile application(s)] [is] [are]</mark>');
    expect(out.unresolvedChoices.map((c) => c.key)).toEqual(['intro.1', 'status.1', 'status.2']);
  });
  it('uses the wording given in choices', () => {
    const out = generateStatement(cfg({ choices: { 'intro.1': 'website', 'status.1': 'This website is', 'status.2': 'the non-compliances' } }));
    expect(out.unresolvedChoices).toEqual([]);
    expect(out.markdown).toContain('Example City Council is committed to making its website accessible');
    expect(out.markdown).toContain('This website is partially compliant with EN 301 549 V3.2.1 (2021-03), due to the non-compliances listed below.');
    expect(out.html).not.toContain('<mark>');
  });
  it('lists choices per language and status', () => {
    expect(listStatementChoices('de', 'full').map((c) => c.key)).toEqual(['intro.1', 'status.1']);
    expect(listStatementChoices('en', 'non')[1]?.official).toBe('[This] [These] [website(s)] [mobile application(s)] [is] [are]');
    expect(() => listStatementChoices('ga', 'full')).toThrow(/no official model/);
  });
  it('omits empty optional parts and the last-review sentence when not given', () => {
    const out = generateStatement(cfg({ nonCompliances: undefined, status: 'full' }));
    expect(out.markdown).not.toContain('Non-accessible content');
    expect(out.markdown).not.toContain('last reviewed');
  });
  it('adds failed success criteria from a scan report', () => {
    const out = generateStatement(cfg(), report());
    expect(out.markdown).toContain('EN 301 549 V3.2.1 9.1.1.1 (WCAG 2.1 1.1.1 Non\\-text Content)'.replace('\\-', '-'));
    const without = generateStatement(cfg({ includeScanFindings: false }), report());
    expect(without.markdown).not.toContain('9.1.1.1');
  });
  it('refuses "full" when the scan found violations or non-compliances are listed', () => {
    expect(() => generateStatement(cfg({ status: 'full', nonCompliances: undefined }), report())).toThrow(/contradicts/);
    expect(() => generateStatement(cfg({ status: 'full' }))).toThrow(/cannot list/);
    expect(() => generateStatement(cfg({ status: 'full', nonCompliances: undefined }), report([page({ violations: [] })]))).not.toThrow();
  });
  it('rejects unknown languages, bad choice keys and Irish', () => {
    expect(() => cfg({ language: 'ga' })).toThrow(/language/);
    expect(() => cfg({ choices: { 'x.1': 'a' } })).toThrow();
    expect(() => cfg({ choices: { 'intro.1': 'a\nb' } })).toThrow();
  });
  it('escapes hostile values', () => {
    const out = generateStatement(cfg({ bodyName: EVIL, scope: EVIL, nonCompliances: [EVIL], choices: { 'intro.1': EVIL.replace(/\n/g, '') }, feedback: EVIL, contact: EVIL }));
    expect(out.html).not.toContain('<script');
    expect(out.html).not.toContain('<img');
    expect(out.markdown).not.toContain('<script');
  });
  it('the document starts with the official title and uses the statement language', () => {
    const { doc } = buildStatementDoc(cfg({ language: 'lt' }));
    expect(doc.title).toBe('PAREIŠKIMAS DĖL PRIEINAMUMO');
    expect(generateStatement(cfg({ language: 'lt' })).html).toContain('<html lang="lt">');
  });
});
