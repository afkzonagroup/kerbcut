// Copyright 2026 MB AFKzona Group
// SPDX-License-Identifier: AGPL-3.0-only
import { describe, expect, it } from 'vitest';
import { ValidationError } from '../src/config/v.js';
import { EAA_TEXT } from '../src/data/eaa-text.generated.js';
import { buildAnnexVDoc, generateAnnexV, parseAnnexVConfig, type AnnexVConfig } from '../src/generators/annex-v.js';
import { LABELS } from '../src/generators/labels.js';
import { EU_LANGUAGES } from '../src/generators/languages.js';
import { escapeHtml, escapeMarkdown } from '../src/util/escape.js';
import { annexVBase } from './helpers/configs.js';
import { EVIL, report } from './helpers/fixtures.js';


const cfg = (over: Record<string, unknown> = {}): AnnexVConfig => parseAnnexVConfig({ ...annexVBase, ...over });

describe('Annex V configuration validation', () => {
  it('accepts a valid configuration', () => {
    expect(cfg().service.category).toBe('e-commerce');
  });
  it.each([
    [{ language: 'xx' }, /language/],
    [{ updatedOn: '2026-02-30' }, /updatedOn/],
    [{ requirements: [] }, /requirements/],
    [{ requirements: [{ point: 'III.z', status: 'met', explanation: 'x' }] }, /point/],
    [{ provider: { name: 'x', website: 'javascript:alert(1)' } }, /website/],
    [{ extra: true }, /unknown property "extra"/],
    [{ contact: { email: 'not an email' } }, /email/],
  ])('rejects %j', (over, msg) => {
    expect(() => cfg(over)).toThrow(msg);
  });
  it('allows Annex I Section IV(g) points only for e-commerce services', () => {
    expect(() => cfg({ service: { ...annexVBase.service, category: 'consumer-banking' } })).toThrow(/e-commerce services only/);
    expect(cfg({ service: { ...annexVBase.service, category: 'other' }, requirements: [{ point: 'III.c', status: 'met', explanation: 'x' }] }).service.category).toBe('other');
  });
  it('needs at least one contact channel', () => {
    expect(() => cfg({ contact: {} })).toThrow(ValidationError);
    expect(() => cfg({ contact: {} })).toThrow(/contact/);
  });
  it('reports cross-field errors as ValidationError', () => {
    expect(() => cfg({ service: { ...annexVBase.service, category: 'e-books' } })).toThrow(ValidationError);
  });
  it('notes the Annex I Section IV points it cannot quote for other service categories', () => {
    const only3 = { requirements: [{ point: 'III.c', status: 'met', explanation: 'x' }] };
    expect(generateAnnexV(cfg()).notes).toEqual([]);
    expect(generateAnnexV(cfg({ ...only3, service: { ...annexVBase.service, category: 'other' } })).notes).toEqual([]);
    for (const [category, point] of [
      ['electronic-communications', '(a)'],
      ['audiovisual-media-access', '(b)'],
      ['passenger-transport', '(c) or (d)'],
      ['consumer-banking', '(e)'],
      ['e-books', '(f)'],
    ] as const) {
      const notes = generateAnnexV(cfg({ ...only3, service: { ...annexVBase.service, category } })).notes;
      expect(notes, category).toHaveLength(1);
      expect(notes[0]).toContain(`Section IV point ${point}`);
    }
  });
  it('throws ValidationError for wrong types', () => {
    expect(() => parseAnnexVConfig('nope')).toThrow(ValidationError);
  });
});

describe('Annex V document', () => {
  it('quotes Annex V and Annex I verbatim from the official text and cites the articles', () => {
    const out = generateAnnexV(cfg());
    const t = EAA_TEXT.en!;
    for (const k of ['1.a', '1.b', '1.c', '2', '3'] as const) expect(out.markdown).toContain(escapeMarkdown(t.annexV[k], { atLineStart: false }));
    expect(out.html).toContain(escapeHtml(t.annexV['1.a']));
    expect(out.html).toContain(escapeHtml(t.annexI['III.c']));
    expect(out.html).toContain(escapeHtml(t.annexI['IV.g.iii']));
    expect(out.html).toContain('ANNEX I, Section III, (c)');
    expect(out.html).toContain('Article 13 (Obligations of service providers)');
    expect(out.html).toContain('ANNEX V (INFORMATION ON SERVICES MEETING ACCESSIBILITY REQUIREMENTS)');
    expect(out.html).toContain('href="https://eur-lex.europa.eu/legal-content/EN/TXT/HTML/?uri=CELEX:32019L0882"');
    expect(out.sources.legalText).toMatchObject({ source: 'official', celex: '32019L0882' });
    expect(out.sources.labels).toEqual({ source: 'original', reviewed: true });
  });

  it('works in all 24 official languages and flags translated labels', () => {
    for (const language of EU_LANGUAGES) {
      const out = generateAnnexV(cfg({ language }));
      const t = EAA_TEXT[language]!;
      expect(out.html, language).toContain(escapeHtml(t.annexV['1.c']));
      expect(out.html, language).toContain(`<html lang="${language}">`);
      expect(out.html, language).toContain(escapeHtml(LABELS[language]!.labels.requirements));
      expect(out.sources.labels.source, language).toBe(language === 'en' ? 'original' : 'translation');
      expect(out.sources.labels.reviewed, language).toBe(language === 'en');
    }
  });

  it('applies the Croatian corrigendum 32019L0882R(05) to Annex I Section III(d)', () => {
    const hr = EAA_TEXT.hr!;
    expect(hr.annexI['III.d']).toContain('pristupačnosti usluge i njezinoj kompatibilnosti');
    expect(hr.corrections.map((c) => c.celex)).toEqual(['32019L0882R(05)']);
  });

  it('includes exemptions with the official wording of Articles 2(4), 4(5) and 14', () => {
    const out = generateAnnexV(
      cfg({
        microenterprise: true,
        disproportionateBurden: [{ scope: 'Video archive captions', assessedOn: '2026-01-15', nextAssessmentBy: '2031-01-15' }],
        fundamentalAlteration: [{ scope: 'Live auction format', assessedOn: '2026-01-15' }],
        contentNotCovered: [{ ground: 'd', description: 'Marketplace seller descriptions' }],
      }),
    );
    const t = EAA_TEXT.en!;
    expect(out.html).toContain(escapeHtml(t.paragraphs['4.5']));
    expect(out.html).toContain(escapeHtml(t.paragraphs['2.4.d']));
    expect(out.html).toContain('Article 14: Fundamental alteration and disproportionate burden');
    expect(out.html).toContain('Next assessment by 2031-01-15');
  });

  it('adds automated test evidence with the limits of automated testing', () => {
    const out = generateAnnexV(cfg(), report());
    expect(out.markdown).toContain('Automated testing finds only part of accessibility issues');
    expect(out.markdown).toContain('Rule failures found: 1');
  });

  it('escapes hostile values in Markdown and HTML', () => {
    const out = generateAnnexV(
      cfg({
        provider: { name: EVIL, address: EVIL },
        service: { ...annexVBase.service, name: EVIL, description: `${EVIL}\n# heading\n[x](javascript:alert(1))`, operation: EVIL },
        requirements: [{ point: 'III.a', status: 'met', explanation: EVIL }],
        conformityProcess: EVIL,
        contact: { postal: EVIL },
      }),
    );
    expect(out.html).not.toContain('<script');
    expect(out.html).not.toContain('<img');
    expect(out.html).not.toMatch(/href="javascript/i);
    expect(out.markdown).not.toContain('<script');
    expect(out.markdown).not.toContain('<img');
    expect(out.markdown).not.toMatch(/^# heading/m);
    expect(out.markdown).not.toContain('[x](javascript');
  });

  it('builds headings in order', () => {
    const doc = buildAnnexVDoc(cfg());
    const h2 = doc.blocks.filter((b) => b.kind === 'heading' && b.level === 2).map((b) => (b.kind === 'heading' ? b.text : ''));
    expect(h2).toEqual([
      'Legal basis',
      'Description of the service',
      'How the service works',
      'How the service meets the accessibility requirements',
      'Standards and technical specifications applied',
      'How compliance is ensured and monitored',
      'Accessibility contact',
      'Authority responsible for checking compliance',
    ]);
  });
});

describe('official text data', () => {
  it('has all 24 languages with every key filled and a source hash', () => {
    expect(Object.keys(EAA_TEXT).sort()).toEqual([...EU_LANGUAGES].sort());
    for (const [lang, t] of Object.entries(EAA_TEXT)) {
      expect(t.source).toBe('official');
      expect(t.sha256, lang).toMatch(/^[0-9a-f]{64}$/);
      expect(t.url).toBe(`https://eur-lex.europa.eu/legal-content/${lang.toUpperCase()}/TXT/HTML/?uri=CELEX:32019L0882`);
      for (const v of [...Object.values(t.annexI), ...Object.values(t.annexV), ...Object.values(t.paragraphs)]) expect(v.length, lang).toBeGreaterThan(0);
      for (const n of ['2', '4', '13', '14', '15']) expect(t.articles[n]?.heading, `${lang} art ${n}`).toContain(n);
    }
  });
  it('every language has a complete label set', () => {
    const keys = Object.keys(LABELS.en!.labels).sort();
    for (const lang of EU_LANGUAGES) {
      expect(Object.keys(LABELS[lang]!.labels).sort(), lang).toEqual(keys);
      for (const v of Object.values(LABELS[lang]!.labels)) expect(v.trim().length, lang).toBeGreaterThan(0);
    }
  });
});
