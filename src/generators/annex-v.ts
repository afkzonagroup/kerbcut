// Copyright 2026 MB AFKzona Group
// SPDX-License-Identifier: AGPL-3.0-only
//
// Service information under Article 13(2) and Annex V of Directive (EU)
// 2019/882 (European Accessibility Act). The provider writes the content;
// this generator structures it along Annex V and Annex I, quotes the legal
// requirements verbatim from the official text in the chosen language, and
// adds the article references. It does not judge whether the service meets
// the requirements.
import { arr, bool, httpUrl, isoDate, obj, oneOf, opt, str, ValidationError, type Infer } from '../config/v.js';
import { EAA_CELEX, EAA_ELI, EAA_TEXT } from '../data/eaa-text.generated.js';
import type { AnnexIKey, EaaLanguageText } from '../data/eaa-text-types.js';
import type { ScanEvidence } from '../report/evidence.js';
import { renderHtml, renderMarkdown, type Block, type Doc, type Inline } from './doc.js';
import { LABELS, type LabelKey } from './labels.js';
import { EU_LANGUAGES } from './languages.js';

/**
 * Annex I points a service provider can describe with this generator.
 * Section III applies to services under Article 4(3) (except urban,
 * suburban and regional transport services). Of Section IV, only point (g)
 * (e-commerce) is supported; points (a) to (f) are not yet.
 */
export const ANNEX_I_SERVICE_POINTS = [
  'III.a', 'III.b', 'III.b.i', 'III.b.ii', 'III.b.iii', 'III.b.iv', 'III.b.v', 'III.b.vi', 'III.b.vii', 'III.c', 'III.d',
  'IV.g.i', 'IV.g.ii', 'IV.g.iii',
] as const satisfies readonly AnnexIKey[];

const text = (max: number): ReturnType<typeof str> => str({ min: 1, max, multiline: true });
const line = (max: number): ReturnType<typeof str> => str({ min: 1, max });

/** Validator for the Annex V configuration. */
export const annexVConfigValidator = obj({
  language: oneOf(EU_LANGUAGES),
  updatedOn: isoDate,
  provider: obj({
    name: line(300),
    address: opt(text(1000)),
    website: opt(httpUrl()),
  }),
  service: obj({
    name: line(300),
    url: opt(httpUrl()),
    category: oneOf(['e-commerce', 'consumer-banking', 'electronic-communications', 'audiovisual-media-access', 'passenger-transport', 'e-books', 'other'] as const),
    /** Annex V point 1(a). */
    description: text(10_000),
    /** Annex V point 1(b). */
    operation: text(20_000),
  }),
  /** Annex V point 1(c): one entry per Annex I point. */
  requirements: arr(
    obj({
      point: oneOf(ANNEX_I_SERVICE_POINTS),
      status: oneOf(['met', 'partially-met', 'not-met', 'not-applicable'] as const),
      explanation: text(10_000),
    }),
    { min: 1, max: 50 },
  ),
  /** Annex V point 2. */
  standards: opt(arr(obj({ reference: line(300), scope: opt(text(2000)) }), { max: 20 })),
  /** Annex V point 3. */
  conformityProcess: text(20_000),
  /** Article 14. */
  disproportionateBurden: opt(arr(obj({ scope: text(2000), assessedOn: isoDate, nextAssessmentBy: opt(isoDate) }), { max: 20 })),
  fundamentalAlteration: opt(arr(obj({ scope: text(2000), assessedOn: isoDate }), { max: 20 })),
  /** Article 2(4). */
  contentNotCovered: opt(arr(obj({ ground: oneOf(['a', 'b', 'c', 'd', 'e'] as const), description: text(2000) }), { max: 20 })),
  /** Article 4(5). */
  microenterprise: opt(bool),
  contact: obj({
    email: opt(str({ max: 254, pattern: /^[^\s@<>()[\]\\,;:"]+@[^\s@<>()[\]\\,;:"]+\.[^\s@<>()[\]\\,;:"]+$/ })),
    phone: opt(str({ max: 40, pattern: /^[+0-9 ()./-]{3,40}$/ })),
    url: opt(httpUrl()),
    postal: opt(text(1000)),
  }),
  authority: opt(obj({ name: line(300), url: opt(httpUrl()) })),
});

/** Annex V configuration (validated). */
export type AnnexVConfig = Infer<typeof annexVConfigValidator>;

/** Validates untrusted input into an AnnexVConfig. Throws ValidationError. */
export function parseAnnexVConfig(input: unknown): AnnexVConfig {
  const cfg = annexVConfigValidator(input, '');
  // Annex I Section IV point (g) applies to e-commerce services only.
  const ecommerceOnly = cfg.requirements.find((r) => r.point.startsWith('IV.g') && cfg.service.category !== 'e-commerce');
  if (ecommerceOnly) throw new ValidationError('requirements', `point ${ecommerceOnly.point} (Annex I Section IV(g)) applies to e-commerce services only`);
  if (cfg.contact.email === undefined && cfg.contact.phone === undefined && cfg.contact.url === undefined && cfg.contact.postal === undefined) {
    throw new ValidationError('contact', 'give at least one of email, phone, url, postal');
  }
  return cfg;
}

function pointLabel(key: AnnexIKey, t: EaaLanguageText): string {
  // "III.b.i" -> "ANNEX I, Section III, (b)(i)" in the document language.
  const [section, ...rest] = key.split('.');
  const heading = section === 'III' ? t.annexI['III.heading'] : t.annexI['IV.heading'];
  return `${t.annexI.heading}, ${heading}, ${rest.map((r) => `(${r})`).join('')}`;
}

/** Builds the document model. Exported for tests. */
export function buildAnnexVDoc(cfg: AnnexVConfig, scan?: ScanEvidence): Doc {
  const lang = cfg.language;
  const t = EAA_TEXT[lang];
  const labelSet = LABELS[lang];
  if (!t || !labelSet) throw new Error(`no text for language ${lang}`);
  const L = (k: LabelKey): string => labelSet.labels[k];
  const V = t.annexV;
  const annexVRef = V.heading;
  const blocks: Block[] = [];
  const h1 = `${L('title')}: ${cfg.service.name}`;
  blocks.push({ kind: 'heading', level: 1, text: h1 });
  const meta: Inline[] = [`${L('provider')}: ${cfg.provider.name}`];
  if (cfg.provider.address !== undefined) meta.push(`\n${cfg.provider.address}`);
  if (cfg.provider.website !== undefined) meta.push('\n', { text: cfg.provider.website, href: cfg.provider.website });
  blocks.push({ kind: 'paragraph', content: meta });
  const svc: Inline[] = [`${L('service')}: ${cfg.service.name}`];
  if (cfg.service.url !== undefined) svc.push(' (', { text: cfg.service.url, href: cfg.service.url }, ')');
  svc.push(`\n${L('updated')}: ${cfg.updatedOn}`);
  blocks.push({ kind: 'paragraph', content: svc });

  // Legal basis, quoted from the official title and headings.
  const a13 = t.articles['13'];
  blocks.push({ kind: 'heading', level: 2, text: L('legalBasis') });
  blocks.push({
    kind: 'paragraph',
    content: [
      `${t.title.join(' ')}. ${a13 ? `${a13.heading} (${a13.title})` : ''}; ${V.heading} (${V.title}). `,
      { text: `${L('officialText')} (CELEX ${EAA_CELEX})`, href: t.url },
    ],
  });

  // Annex V point 1(a)
  blocks.push({ kind: 'heading', level: 2, text: L('description') });
  blocks.push({ kind: 'quote', cite: `${annexVRef}, 1(a)`, text: V['1.a'] });
  blocks.push({ kind: 'paragraph', content: [cfg.service.description] });

  // Annex V point 1(b)
  blocks.push({ kind: 'heading', level: 2, text: L('operation') });
  blocks.push({ kind: 'quote', cite: `${annexVRef}, 1(b)`, text: V['1.b'] });
  blocks.push({ kind: 'paragraph', content: [cfg.service.operation] });

  // Annex V point 1(c) with Annex I
  blocks.push({ kind: 'heading', level: 2, text: L('requirements') });
  blocks.push({ kind: 'quote', cite: `${annexVRef}, 1(c)`, text: V['1.c'] });
  const statusLabel = { met: L('met'), 'partially-met': L('partiallyMet'), 'not-met': L('notMet'), 'not-applicable': L('notApplicable') } as const;
  blocks.push({
    kind: 'table',
    head: [L('requirement'), L('status'), L('explanation')],
    rows: cfg.requirements.map((r) => [`${pointLabel(r.point, t)}: “${t.annexI[r.point]}”`, statusLabel[r.status], r.explanation]),
  });

  // Annex V point 2
  blocks.push({ kind: 'heading', level: 2, text: L('standards') });
  blocks.push({ kind: 'quote', cite: `${annexVRef}, 2`, text: V['2'] });
  const stds = cfg.standards ?? [];
  blocks.push(
    stds.length === 0
      ? { kind: 'paragraph', content: [L('noStandards')] }
      : { kind: 'list', items: stds.map((s) => [s.scope !== undefined ? `${s.reference}: ${s.scope}` : s.reference]) },
  );

  // Annex V point 3
  blocks.push({ kind: 'heading', level: 2, text: L('compliance') });
  blocks.push({ kind: 'quote', cite: `${annexVRef}, 3`, text: V['3'] });
  blocks.push({ kind: 'paragraph', content: [cfg.conformityProcess] });

  // Exemptions
  const a14 = t.articles['14'];
  const a2 = t.articles['2'];
  const a4 = t.articles['4'];
  const exemptionBlocks: Block[] = [];
  if (cfg.microenterprise === true && a4) {
    exemptionBlocks.push({ kind: 'quote', cite: a4.heading, text: t.paragraphs['4.5'] });
  }
  if ((cfg.disproportionateBurden?.length ?? 0) > 0 || (cfg.fundamentalAlteration?.length ?? 0) > 0) {
    if (a14) exemptionBlocks.push({ kind: 'heading', level: 3, text: `${a14.heading}: ${a14.title}` });
    const items: Inline[][] = [];
    for (const d of cfg.fundamentalAlteration ?? []) items.push([`${d.scope} (${L('assessedOn')} ${d.assessedOn})`]);
    for (const d of cfg.disproportionateBurden ?? []) {
      items.push([`${d.scope} (${L('assessedOn')} ${d.assessedOn}${d.nextAssessmentBy !== undefined ? `; ${L('nextAssessment')} ${d.nextAssessmentBy}` : ''})`]);
    }
    exemptionBlocks.push({ kind: 'list', items });
  }
  if ((cfg.contentNotCovered?.length ?? 0) > 0 && a2) {
    exemptionBlocks.push({ kind: 'heading', level: 3, text: `${a2.heading}: ${t.paragraphs['2.4']}` });
    exemptionBlocks.push({
      kind: 'table',
      head: [L('requirement'), L('explanation')],
      rows: (cfg.contentNotCovered ?? []).map((c) => [`(${c.ground}) ${t.paragraphs[`2.4.${c.ground}`]}`, c.description]),
    });
  }
  if (exemptionBlocks.length > 0) {
    blocks.push({ kind: 'heading', level: 2, text: L('exemptions') }, ...exemptionBlocks);
  }

  // Contact and authority
  blocks.push({ kind: 'heading', level: 2, text: L('contact') });
  const contact: Inline[][] = [];
  if (cfg.contact.email !== undefined) contact.push([{ text: cfg.contact.email, href: `mailto:${cfg.contact.email}` }]);
  if (cfg.contact.phone !== undefined) contact.push([cfg.contact.phone]);
  if (cfg.contact.url !== undefined) contact.push([{ text: cfg.contact.url, href: cfg.contact.url }]);
  if (cfg.contact.postal !== undefined) contact.push([cfg.contact.postal]);
  blocks.push({ kind: 'list', items: contact });
  if (cfg.authority) {
    blocks.push({ kind: 'heading', level: 2, text: L('authority') });
    blocks.push({
      kind: 'paragraph',
      content: cfg.authority.url !== undefined ? [{ text: cfg.authority.name, href: cfg.authority.url }] : [cfg.authority.name],
    });
  }

  // Automated test evidence
  if (scan) {
    blocks.push({ kind: 'heading', level: 2, text: L('automatedTests') });
    blocks.push({ kind: 'paragraph', content: [{ mark: L('automatedNote') }] });
    blocks.push({
      kind: 'list',
      items: [
        [`${L('testedOn')}: ${scan.scan.startedAt.slice(0, 10)} (${scan.tool.name} ${scan.tool.version}, axe-core ${scan.tool.axeCoreVersion}, WCAG ${scan.standards.wcag} A/AA, EN 301 549 ${scan.standards.en301549Version})`],
        [`${L('pagesScanned')}: ${scan.summary.pagesScanned}`],
        [`${L('violations')}: ${scan.summary.violations.findings}`],
      ],
    });
  }
  return { lang, title: h1, blocks };
}

/**
 * Annex I Section IV points that also apply to a service category but that
 * this generator cannot quote yet. Section IV(c) and (d) depend on the kind
 * of transport service.
 */
const SECTION_IV_NOT_SUPPORTED: Readonly<Partial<Record<AnnexVConfig['service']['category'], string>>> = {
  'electronic-communications': '(a)',
  'audiovisual-media-access': '(b)',
  'passenger-transport': '(c) or (d)',
  'consumer-banking': '(e)',
  'e-books': '(f)',
};

/** Notes for the person preparing the document (English, not part of it). Exported for tests. */
export function annexVNotes(cfg: AnnexVConfig): string[] {
  const point = SECTION_IV_NOT_SUPPORTED[cfg.service.category];
  return point === undefined
    ? []
    : [
        `Annex I Section IV point ${point} also applies to ${cfg.service.category} services. This generator does not quote it yet, so the document is incomplete without your own description of how the service meets it.`,
      ];
}

/** Output of the Annex V generator. */
export interface AnnexVOutput {
  readonly markdown: string;
  readonly html: string;
  /** Notes for the person preparing the document, for example requirements the generator does not cover. */
  readonly notes: readonly string[];
  /** Provenance of the text in the document. */
  readonly sources: {
    readonly legalText: { readonly source: 'official'; readonly celex: string; readonly eli: string; readonly url: string };
    readonly labels: { readonly source: 'original' | 'translation'; readonly reviewed: boolean };
  };
}

/**
 * Generates the Annex V service information as Markdown and HTML.
 *
 * @example
 * ```ts
 * const out = generateAnnexV(parseAnnexVConfig(JSON.parse(configText)));
 * await writeFile('accessibility.md', out.markdown);
 * ```
 */
export function generateAnnexV(cfg: AnnexVConfig, scan?: ScanEvidence): AnnexVOutput {
  const doc = buildAnnexVDoc(cfg, scan);
  const t = EAA_TEXT[cfg.language];
  const labels = LABELS[cfg.language];
  if (!t || !labels) throw new Error(`no text for language ${cfg.language}`);
  return {
    markdown: renderMarkdown(doc),
    html: renderHtml(doc),
    notes: annexVNotes(cfg),
    sources: {
      legalText: { source: 'official', celex: EAA_CELEX, eli: EAA_ELI, url: t.url },
      labels: { source: labels.source, reviewed: labels.reviewed },
    },
  };
}
