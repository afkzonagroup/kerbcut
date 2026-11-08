// Copyright 2026 MB AFKzona Group
// SPDX-License-Identifier: AGPL-3.0-only
//
// Extracts, verbatim, the parts of Directive (EU) 2019/882 that the Annex V
// service information generator uses, in every official language:
//   - the act title,
//   - the headings and titles of Articles 2, 4, 13, 14 and 15,
//   - Article 2(4) (content not covered) and Article 4(5) (microenterprises),
//   - Annex I Section III (all points) and Section IV point (g) (e-commerce),
//   - Annex V (all points).
// Usage: node scripts/legal/extract-eaa.mjs <sources-dir> <out.ts>
// <sources-dir>/eaa/<LANG>.html must come from scripts/legal/fetch-sources.mjs.
import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { blockText, htmlToBlocks } from './html-blocks.mjs';
import { EAA_CORRIGENDA, EU_LANGUAGES, SOURCES } from './sources.mjs';

const [srcDir, outFile] = process.argv.slice(2);
if (!srcDir || !outFile) {
  console.error('Usage: node scripts/legal/extract-eaa.mjs <sources-dir> <out.ts>');
  process.exit(2);
}
const RETRIEVED = process.env.RETRIEVED ?? new Date().toISOString().slice(0, 10);

// Offsets are relative to the "ANNEX I" heading. They were read from the
// English text and are checked against enumerator labels in every language.
const ANNEX_I = {
  heading: 0,
  'III.heading': 122, 'III.title': 123, 'III.intro': 124,
  'III.a': 126, 'III.b': 128,
  'III.b.i': 130, 'III.b.ii': 132, 'III.b.iii': 134, 'III.b.iv': 136,
  'III.b.v': 138, 'III.b.vi': 140, 'III.b.vii': 142,
  'III.c': 144, 'III.d': 146,
  'IV.heading': 147, 'IV.title': 148, 'IV.intro': 149,
  'IV.g': 193, 'IV.g.i': 195, 'IV.g.ii': 197, 'IV.g.iii': 199,
};
const ANNEX_I_LABELS = [125, 127, 129, 131, 133, 135, 137, 139, 141, 143, 145, 192, 194, 196, 198];
// Offsets relative to the "ANNEX V" heading.
const ANNEX_V = { heading: 0, title: 1, '1': 3, '1.a': 5, '1.b': 7, '1.c': 9, '2': 11, '3': 13 };
const ANNEX_V_LABELS = [2, 4, 6, 8, 10, 12];
const ARTICLES = [2, 4, 13, 14, 15];

const LABEL_RE = /^\(?[\p{L}\d]{1,5}[.)]$/u;

const result = {};
for (const lang of EU_LANGUAGES) {
  const html = await readFile(join(srcDir, 'eaa', `${lang}.html`), 'utf8');
  const sha256 = createHash('sha256').update(html).digest('hex');
  const blocks = htmlToBlocks(html);
  const docTi = blocks.map((b, i) => [b, i]).filter(([b]) => b.cls === 'oj-doc-ti').map(([, i]) => i);
  if (docTi.length < 9) throw new Error(`${lang}: unexpected document structure`);
  const annexStarts = docTi.slice(-6);
  const annexI = annexStarts[0];
  const annexV = annexStarts[4];
  const text = (i) => {
    const b = blocks[i];
    if (!b) throw new Error(`${lang}: missing block ${i}`);
    return blockText(b).trim();
  };
  for (const off of ANNEX_I_LABELS) {
    if (!LABEL_RE.test(text(annexI + off))) throw new Error(`${lang}: Annex I label check failed at ${off}: ${text(annexI + off)}`);
  }
  for (const off of ANNEX_V_LABELS) {
    if (!LABEL_RE.test(text(annexV + off))) throw new Error(`${lang}: Annex V label check failed at ${off}: ${text(annexV + off)}`);
  }
  if (!/\bIII\b/i.test(text(annexI + ANNEX_I['III.heading']))) throw new Error(`${lang}: Section III heading not found`);
  if (!/\bIV\b/i.test(text(annexI + ANNEX_I['IV.heading']))) throw new Error(`${lang}: Section IV heading not found`);
  if (!/\bV\b/.test(text(annexV))) throw new Error(`${lang}: Annex V heading not found`);

  const annexIText = {};
  for (const [k, off] of Object.entries(ANNEX_I)) annexIText[k] = text(annexI + off);
  const annexVText = {};
  for (const [k, off] of Object.entries(ANNEX_V)) annexVText[k] = text(annexV + off);

  // Article headings: the n-th "oj-ti-art" block is Article n.
  const artIdx = blocks.map((b, i) => [b, i]).filter(([b]) => b.cls === 'oj-ti-art').map(([, i]) => i);
  const articles = {};
  for (const n of ARTICLES) {
    const i = artIdx[n - 1];
    if (i === undefined) throw new Error(`${lang}: Article ${n} missing`);
    const heading = text(i);
    if (!heading.includes(String(n))) throw new Error(`${lang}: Article ${n} heading mismatch: ${heading}`);
    const next = blocks[i + 1];
    articles[n] = { heading, title: next && next.cls === 'oj-sti-art' ? blockText(next).trim() : '' };
  }

  // Article 2(4) (content not covered) and Article 4(5) (microenterprises).
  const a2 = artIdx[1];
  const a4 = artIdx[3];
  if (!/^\(?4[.)]/.test(text(a2 + 49))) throw new Error(`${lang}: Article 2(4) not found`);
  for (const off of [50, 52, 54, 56, 58]) {
    if (!LABEL_RE.test(text(a2 + off))) throw new Error(`${lang}: Article 2(4) label check failed at ${off}`);
  }
  if (!/^\(?5[.)]/.test(text(a4 + 8))) throw new Error(`${lang}: Article 4(5) not found`);
  const paragraphs = {
    '2.4': text(a2 + 49),
    '2.4.a': text(a2 + 51),
    '2.4.b': text(a2 + 53),
    '2.4.c': text(a2 + 55),
    '2.4.d': text(a2 + 57),
    '2.4.e': text(a2 + 59),
    '4.5': text(a4 + 8),
  };

  const corrections = [];
  for (const c of EAA_CORRIGENDA.filter((x) => x.lang === lang)) {
    const key = c.key.replace(/^annexI\./, '');
    if (annexIText[key] !== c.from) throw new Error(`${lang}: corrigendum ${c.celex} does not match the original text`);
    annexIText[key] = c.to;
    corrections.push({ celex: c.celex, eli: c.eli, key: c.key });
  }

  result[lang.toLowerCase()] = {
    source: 'official',
    title: [text(docTi[0]), text(docTi[1]), text(docTi[2])],
    url: SOURCES.eaa.url(lang),
    sha256,
    corrections,
    articles,
    paragraphs,
    annexI: annexIText,
    annexV: annexVText,
  };
  console.log(`${lang}: ok`);
}

const banner = `// Copyright 2026 MB AFKzona Group
// SPDX-License-Identifier: AGPL-3.0-only
//
// GENERATED by scripts/legal/extract-eaa.mjs. Do not edit by hand.
// Verbatim text of Directive (EU) 2019/882 (CELEX ${SOURCES.eaa.celex}),
// ${SOURCES.eaa.eli}, taken from EUR-Lex on ${RETRIEVED} in every official
// language, with the corrigenda listed in "corrections" applied.
import type { EaaTextData } from './eaa-text-types.js';

export const EAA_TEXT_RETRIEVED = ${JSON.stringify(RETRIEVED)};
export const EAA_CELEX = ${JSON.stringify(SOURCES.eaa.celex)};
export const EAA_ELI = ${JSON.stringify(SOURCES.eaa.eli)};

export const EAA_TEXT: EaaTextData = ${JSON.stringify(result, null, 2)};
`;
await writeFile(outFile, banner, 'utf8');
