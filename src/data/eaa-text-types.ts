// Copyright 2026 MB AFKzona Group
// SPDX-License-Identifier: AGPL-3.0-only

/** Keys of the Annex I texts extracted from Directive (EU) 2019/882. */
export type AnnexIKey =
  | 'heading'
  | 'III.heading' | 'III.title' | 'III.intro'
  | 'III.a' | 'III.b' | 'III.b.i' | 'III.b.ii' | 'III.b.iii' | 'III.b.iv' | 'III.b.v' | 'III.b.vi' | 'III.b.vii'
  | 'III.c' | 'III.d'
  | 'IV.heading' | 'IV.title' | 'IV.intro'
  | 'IV.g' | 'IV.g.i' | 'IV.g.ii' | 'IV.g.iii';

/** Keys of the Annex V texts. */
export type AnnexVKey = 'heading' | 'title' | '1' | '1.a' | '1.b' | '1.c' | '2' | '3';

/** Verbatim text of Directive (EU) 2019/882 in one language. */
export interface EaaLanguageText {
  readonly source: 'official';
  /** Title lines: act, date, subject. */
  readonly title: readonly string[];
  readonly url: string;
  /** SHA-256 of the EUR-Lex HTML the text was taken from. */
  readonly sha256: string;
  /** Corrigenda applied to the extracted text. */
  readonly corrections: readonly { readonly celex: string; readonly eli: string; readonly key: string }[];
  readonly articles: Readonly<Record<string, { readonly heading: string; readonly title: string }>>;
  /** Article 2(4) and its points (a) to (e), and Article 4(5). */
  readonly paragraphs: Readonly<Record<'2.4' | '2.4.a' | '2.4.b' | '2.4.c' | '2.4.d' | '2.4.e' | '4.5', string>>;
  readonly annexI: Readonly<Record<AnnexIKey, string>>;
  readonly annexV: Readonly<Record<AnnexVKey, string>>;
}

/** All languages, keyed by lower-case EUR-Lex language code. */
export type EaaTextData = Readonly<Record<string, EaaLanguageText>>;
