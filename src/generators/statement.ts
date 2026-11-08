// Copyright 2026 MB AFKzona Group
// SPDX-License-Identifier: AGPL-3.0-only
//
// Public sector accessibility statement under Directive (EU) 2016/2102,
// Article 7, using the model in the Annex of Commission Implementing
// Decision (EU) 2018/1523. This is a different legal regime from the
// European Accessibility Act: it applies to public sector bodies, not to
// private service providers. Use generateAnnexV() for EAA service information.
//
// How the official model is used:
// - Text that is not in italics is copied verbatim from EUR-Lex.
// - Italic text is what the model tells the public sector body to delete or
//   change. Bracketed instructions are replaced with the values from the
//   configuration. Bracketed grammatical alternatives ("[This] [These]
//   [website(s)] [is] [are]") cannot be chosen correctly by a program for 23
//   languages, so they are kept as in the model and marked, unless the
//   configuration gives the wording in "choices".
// - Endnotes are dropped, as the model instructs.
import { arr, bool, httpUrl, isoDate, obj, oneOf, opt, record, str, type Infer } from '../config/v.js';
import { MODEL_STATEMENT, MODEL_STATEMENT_CELEX, MODEL_STATEMENT_ELI } from '../data/model-statement.generated.js';
import type { ModelSegment } from '../data/model-statement-types.js';
import { en301549Clause, wcagCriterion } from '../mapping/index.js';
import type { ScanEvidence } from '../report/evidence.js';
import { renderHtml, renderMarkdown, type Block, type Doc, type Inline } from './doc.js';

/** Languages in which EUR-Lex publishes Implementing Decision (EU) 2018/1523. */
export const STATEMENT_LANGUAGES = Object.keys(MODEL_STATEMENT).sort() as readonly string[];

// Block numbers in the Annex. The structure is the same in every language;
// test/statement.test.ts checks that.
const B = {
  title: 8,
  intro: 9,
  scope: 10,
  complianceHeading: 11,
  status: { full: 13, partial: 15, non: 17 },
  nonAccessibleHeading: 18,
  nonAccessibleLead: 19,
  reasonA: { label: 20, text: 21 },
  reasonB: { label: 23, text: 24 },
  reasonC: { label: 26, text: 27 },
  preparationHeading: 30,
  preparedOn: 31,
  lastReviewed: 33,
  feedbackHeading: 34,
  enforcementHeading: 37,
} as const;

const text = (max: number): ReturnType<typeof str> => str({ min: 1, max, multiline: true });
const line = (max: number): ReturnType<typeof str> => str({ min: 1, max });

/** Validator for the statement configuration. */
export const statementConfigValidator = obj({
  language: oneOf(STATEMENT_LANGUAGES),
  bodyName: line(300),
  /** Reference to the national law transposing Directive (EU) 2016/2102 (first sentence of the model). */
  legislation: line(500),
  /** Short name of that law for "non-compliance with the [national legislation]". Defaults to legislation. */
  legislationShort: opt(line(300)),
  scope: text(2000),
  /** Standard, technical specification or law the status refers to ("xxx" in the model). */
  standard: line(300),
  status: oneOf(['full', 'partial', 'non'] as const),
  nonCompliances: opt(arr(text(2000), { max: 200 })),
  disproportionateBurden: opt(arr(text(2000), { max: 200 })),
  outOfScope: opt(arr(text(2000), { max: 200 })),
  alternatives: opt(text(5000)),
  preparedOn: isoDate,
  /** Method under Article 3(1) of Implementing Decision (EU) 2018/1523. */
  method: text(2000),
  lastReviewedOn: opt(isoDate),
  feedback: text(5000),
  feedbackUrl: opt(httpUrl()),
  contact: text(2000),
  enforcement: text(5000),
  enforcementUrl: opt(httpUrl()),
  enforcementContact: text(2000),
  /** Wording for the grammatical alternatives, keyed "intro.1", "status.1", ... (see listStatementChoices). */
  choices: opt(record(str({ max: 20, pattern: /^(intro|status|reasonA)\.\d{1,2}$/ }), line(500), { max: 50 })),
  /** Optional content from Section 2 of the model. */
  optional: opt(arr(text(5000), { max: 20 })),
  /** Add the success criteria that failed in the scan report to the non-compliance list (default true). */
  includeScanFindings: opt(bool),
});

/** Statement configuration (validated). */
export type StatementConfig = Infer<typeof statementConfigValidator>;

/** Validates untrusted input into a StatementConfig. Throws ValidationError. */
export function parseStatementConfig(input: unknown): StatementConfig {
  return statementConfigValidator(input, '');
}

// ---------------------------------------------------------------------------
// Working with the model's text

interface Char {
  readonly c: string;
  readonly i: boolean;
}

function chars(segs: readonly ModelSegment[]): Char[] {
  const out: Char[] = [];
  for (const s of segs) for (const c of s.t) out.push({ c, i: s.i === true });
  return out;
}

const plain = (cs: readonly Char[]): string => cs.map((x) => x.c).join('');

function tidy(s: string): string {
  return s
    .replace(/\s+/g, ' ')
    .replace(/\s+([.,;:])/g, '$1')
    .trim();
}

function block(lang: string, index: number): readonly ModelSegment[] {
  const b = MODEL_STATEMENT[lang]?.blocks[index];
  if (!b) throw new Error(`model statement block ${index} missing for ${lang}`);
  return b;
}

/** Verbatim block text. */
function verbatim(lang: string, index: number): string {
  return tidy(block(lang, index).map((s) => s.t).join(''));
}

interface Pair {
  readonly open: number;
  readonly close: number;
  readonly depth: number;
}

function bracketPairs(cs: readonly Char[]): Pair[] {
  const stack: number[] = [];
  const pairs: Pair[] = [];
  cs.forEach((x, idx) => {
    if (x.c === '[') stack.push(idx);
    else if (x.c === ']') {
      const open = stack.pop();
      if (open !== undefined) pairs.push({ open, close: idx, depth: stack.length });
    }
  });
  return pairs.sort((a, b) => a.open - b.open);
}

/**
 * Replaces the first innermost bracketed instruction that contains italic
 * text with the value. With stripOtherBrackets, any remaining "[" and "]"
 * (the model's markers for an optional sentence) are removed. Exported for tests.
 */
export function fillInstruction(segs: readonly ModelSegment[], value: string, opts: { stripOtherBrackets: boolean }): string {
  const cs = chars(segs);
  const pairs = bracketPairs(cs);
  const hasItalic = (p: Pair): boolean => cs.slice(p.open + 1, p.close).some((x) => x.i);
  const candidates = pairs.filter((p) => hasItalic(p) && !pairs.some((q) => q !== p && q.open > p.open && q.close < p.close && hasItalic(q)));
  const target = candidates[0];
  if (!target) throw new Error('no bracketed instruction found');
  let out = `${plain(cs.slice(0, target.open))}\u0000${plain(cs.slice(target.close + 1))}`;
  if (opts.stripOtherBrackets) out = out.replace(/[[\]]/g, '');
  return tidy(out).replace('\u0000', value);
}

/** Values the model asks for inside sentences. */
export type Slot = 'bodyName' | 'legislation' | 'legislationShort' | 'standard';

/** A part of a sentence with grammatical alternatives. */
export type SentencePart =
  | { readonly kind: 'text'; readonly text: string }
  | { readonly kind: 'slot'; readonly slot: Slot }
  | { readonly kind: 'choice'; readonly key: string; readonly official: string };

/**
 * Splits a model sentence into fixed text, value slots and choice groups.
 * Top-level brackets are placeholders. A bracket whose text contains
 * "2016/2102" is the legislation slot; one whose text is "xxx" is the
 * standard slot; in the intro sentence the first bracket is the name of the
 * public sector body; in reason (a) the last bracket is the national law.
 * Neighbouring placeholders separated only by spaces or
 * "/" form one choice group. Exported for tests.
 */
export function splitSentence(segs: readonly ModelSegment[], prefix: 'intro' | 'status' | 'reasonA'): SentencePart[] {
  const cs = chars(segs);
  const top = bracketPairs(cs).filter((p) => p.depth === 0);
  const parts: SentencePart[] = [];
  let pos = 0;
  let choiceN = 0;
  let pending: { start: number; end: number } | undefined;
  const flushChoice = (): void => {
    if (!pending) return;
    choiceN++;
    parts.push({ kind: 'choice', key: `${prefix}.${choiceN}`, official: tidy(plain(cs.slice(pending.start, pending.end + 1))) });
    pending = undefined;
  };
  top.forEach((p, n) => {
    const inner = tidy(plain(cs.slice(p.open + 1, p.close)));
    const slot: Slot | undefined = inner.includes('2016/2102')
      ? 'legislation'
      : inner.toLowerCase() === 'xxx'
        ? 'standard'
        : prefix === 'intro' && n === 0
          ? 'bodyName'
          : prefix === 'reasonA' && n === top.length - 1
            ? 'legislationShort'
            : undefined;
    const between = plain(cs.slice(pos, p.open));
    if (slot === undefined && pending && /^[\s/]*$/.test(between)) {
      pending.end = p.close;
      pos = p.close + 1;
      return;
    }
    flushChoice();
    if (between !== '') parts.push({ kind: 'text', text: between });
    if (slot !== undefined) parts.push({ kind: 'slot', slot });
    else pending = { start: p.open, end: p.close };
    pos = p.close + 1;
  });
  flushChoice();
  const rest = plain(cs.slice(pos));
  if (rest !== '') parts.push({ kind: 'text', text: rest });
  return parts;
}

/** A grammatical choice the user may word. */
export interface StatementChoice {
  readonly key: string;
  /** The model's alternatives, verbatim. */
  readonly official: string;
}

function sentenceBlock(cfg: StatementConfig): { intro: SentencePart[]; status: SentencePart[]; reasonA: SentencePart[] } {
  return {
    intro: splitSentence(block(cfg.language, B.intro), 'intro'),
    status: splitSentence(block(cfg.language, B.status[cfg.status]), 'status'),
    reasonA: splitSentence(block(cfg.language, B.reasonA.text), 'reasonA'),
  };
}

/** Lists the grammatical choices for a language and status, so a user can word them in "choices". */
export function listStatementChoices(language: string, status: 'full' | 'partial' | 'non'): StatementChoice[] {
  if (!MODEL_STATEMENT[language]) throw new Error(`no official model statement in language ${language}`);
  const all = [
    ...splitSentence(block(language, B.intro), 'intro'),
    ...splitSentence(block(language, B.status[status]), 'status'),
    ...splitSentence(block(language, B.reasonA.text), 'reasonA'),
  ];
  return all.filter((p): p is Extract<SentencePart, { kind: 'choice' }> => p.kind === 'choice').map((p) => ({ key: p.key, official: p.official }));
}

function slotValue(slot: Slot, cfg: StatementConfig): string {
  switch (slot) {
    case 'bodyName':
      return cfg.bodyName;
    case 'legislation':
      return cfg.legislation;
    case 'legislationShort':
      return cfg.legislationShort ?? cfg.legislation;
    case 'standard':
      return cfg.standard;
  }
}

function renderSentence(parts: readonly SentencePart[], cfg: StatementConfig, unresolved: StatementChoice[]): Inline[] {
  const out: Inline[] = [];
  let buf = '';
  const flush = (): void => {
    if (buf !== '') out.push(buf);
    buf = '';
  };
  for (const p of parts) {
    if (p.kind === 'text') buf += p.text;
    else if (p.kind === 'slot') {
      // The French model has "avec[xxx]" without a space; keep words apart.
      if (/\p{L}$/u.test(buf)) buf += ' ';
      buf += slotValue(p.slot, cfg);
    } else {
      const chosen = cfg.choices?.[p.key];
      if (chosen !== undefined) buf += chosen;
      else {
        flush();
        out.push({ mark: p.official });
        unresolved.push({ key: p.key, official: p.official });
      }
    }
  }
  flush();
  // Whitespace tidy on text parts only.
  return out.map((x, i) => (typeof x === 'string' ? x.replace(/\s+/g, ' ').replace(i === 0 ? /^\s+/ : /$^/, '').replace(/\s+([.,;:])/g, '$1') : x));
}

/**
 * One line per success criterion that failed in a scan, for the
 * non-compliance list. Clause numbers are language-neutral; WCAG titles are
 * the English W3C titles.
 */
export function scanFindingLines(scan: ScanEvidence): string[] {
  return scan.summary.byCriterion.map((c) => {
    const crit = wcagCriterion(c.sc);
    const clause = en301549Clause(c.sc, scan.standards.en301549Version);
    const en = clause ? `EN 301 549 ${scan.standards.en301549Version} ${clause.clause}` : 'EN 301 549';
    return `${en} (WCAG ${scan.standards.wcag} ${c.sc} ${crit?.title ?? ''})`.replace(/\s+\)/, ')');
  });
}

/** Output of the statement generator. */
export interface StatementOutput {
  readonly markdown: string;
  readonly html: string;
  /** Grammatical alternatives that were not worded in "choices" and are marked in the output. */
  readonly unresolvedChoices: readonly StatementChoice[];
  readonly sources: {
    readonly template: { readonly source: 'official'; readonly celex: string; readonly eli: string; readonly url: string };
  };
}

/** Builds the document model. Exported for tests. */
export function buildStatementDoc(cfg: StatementConfig, scan?: ScanEvidence): { doc: Doc; unresolved: StatementChoice[] } {
  const lang = cfg.language;
  const model = MODEL_STATEMENT[lang];
  if (!model) throw new Error(`no official model statement in language ${lang}`);
  // Endnote iii of the model: select (a) only if all requirements are fully met without exceptions.
  if (cfg.status === 'full') {
    if (scan && scan.summary.violations.findings > 0) throw new Error('status "full" contradicts the scan report, which found violations');
    if ((cfg.nonCompliances?.length ?? 0) > 0 || (cfg.disproportionateBurden?.length ?? 0) > 0) {
      throw new Error('status "full" cannot list non-compliances or a disproportionate burden');
    }
  }
  const unresolved: StatementChoice[] = [];
  const s = sentenceBlock(cfg);
  const blocks: Block[] = [];
  const title = verbatim(lang, B.title);
  blocks.push({ kind: 'heading', level: 1, text: title });
  blocks.push({ kind: 'paragraph', content: renderSentence(s.intro, cfg, unresolved) });
  blocks.push({ kind: 'paragraph', content: [fillInstruction(block(lang, B.scope), cfg.scope, { stripOtherBrackets: false })] });

  blocks.push({ kind: 'heading', level: 2, text: verbatim(lang, B.complianceHeading) });
  blocks.push({ kind: 'paragraph', content: renderSentence(s.status, cfg, unresolved) });

  const scanLines = scan && cfg.includeScanFindings !== false ? scanFindingLines(scan) : [];
  const nonCompliances = [...(cfg.nonCompliances ?? []), ...scanLines];
  const burden = cfg.disproportionateBurden ?? [];
  const outOfScope = cfg.outOfScope ?? [];
  if (nonCompliances.length + burden.length + outOfScope.length > 0) {
    blocks.push({ kind: 'heading', level: 2, text: verbatim(lang, B.nonAccessibleHeading) });
    blocks.push({ kind: 'paragraph', content: [verbatim(lang, B.nonAccessibleLead)] });
    if (nonCompliances.length > 0) {
      blocks.push({ kind: 'paragraph', content: [`${verbatim(lang, B.reasonA.label)} `, ...renderSentence(s.reasonA, cfg, unresolved)] });
      blocks.push({ kind: 'list', items: nonCompliances.map((x) => [x]) });
    }
    if (burden.length > 0) {
      blocks.push({ kind: 'paragraph', content: [`${verbatim(lang, B.reasonB.label)} ${verbatim(lang, B.reasonB.text)}`] });
      blocks.push({ kind: 'list', items: burden.map((x) => [x]) });
    }
    if (outOfScope.length > 0) {
      blocks.push({ kind: 'paragraph', content: [`${verbatim(lang, B.reasonC.label)} ${verbatim(lang, B.reasonC.text)}`] });
      blocks.push({ kind: 'list', items: outOfScope.map((x) => [x]) });
    }
    if (cfg.alternatives !== undefined) blocks.push({ kind: 'paragraph', content: [cfg.alternatives] });
  }

  blocks.push({ kind: 'heading', level: 2, text: verbatim(lang, B.preparationHeading) });
  blocks.push({ kind: 'paragraph', content: [fillInstruction(block(lang, B.preparedOn), cfg.preparedOn, { stripOtherBrackets: false })] });
  blocks.push({ kind: 'paragraph', content: [cfg.method] });
  if (cfg.lastReviewedOn !== undefined) {
    blocks.push({ kind: 'paragraph', content: [fillInstruction(block(lang, B.lastReviewed), cfg.lastReviewedOn, { stripOtherBrackets: true })] });
  }

  blocks.push({ kind: 'heading', level: 2, text: verbatim(lang, B.feedbackHeading) });
  blocks.push({ kind: 'paragraph', content: cfg.feedbackUrl !== undefined ? [cfg.feedback, '\n', { text: cfg.feedbackUrl, href: cfg.feedbackUrl }] : [cfg.feedback] });
  blocks.push({ kind: 'paragraph', content: [cfg.contact] });

  blocks.push({ kind: 'heading', level: 2, text: verbatim(lang, B.enforcementHeading) });
  blocks.push({
    kind: 'paragraph',
    content: cfg.enforcementUrl !== undefined ? [cfg.enforcement, '\n', { text: cfg.enforcementUrl, href: cfg.enforcementUrl }] : [cfg.enforcement],
  });
  blocks.push({ kind: 'paragraph', content: [cfg.enforcementContact] });

  for (const o of cfg.optional ?? []) blocks.push({ kind: 'paragraph', content: [o] });
  return { doc: { lang, title, blocks }, unresolved };
}

/**
 * Generates a public sector accessibility statement from the official model.
 *
 * @example
 * ```ts
 * const out = generateStatement(parseStatementConfig(JSON.parse(configText)));
 * if (out.unresolvedChoices.length > 0) console.warn('word these in "choices":', out.unresolvedChoices);
 * ```
 */
export function generateStatement(cfg: StatementConfig, scan?: ScanEvidence): StatementOutput {
  const { doc, unresolved } = buildStatementDoc(cfg, scan);
  const model = MODEL_STATEMENT[cfg.language];
  if (!model) throw new Error(`no official model statement in language ${cfg.language}`);
  return {
    markdown: renderMarkdown(doc),
    html: renderHtml(doc),
    unresolvedChoices: unresolved,
    sources: { template: { source: 'official', celex: MODEL_STATEMENT_CELEX, eli: MODEL_STATEMENT_ELI, url: model.url } },
  };
}
