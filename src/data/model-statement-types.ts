// Copyright 2026 MB AFKzona Group
// SPDX-License-Identifier: AGPL-3.0-only

/** A run of text. "i" marks italic text (text the model says to replace). */
export interface ModelSegment {
  readonly t: string;
  readonly i?: true;
}

/** The model statement in one language. */
export interface ModelStatementLanguage {
  readonly source: 'official';
  readonly url: string;
  /** SHA-256 of the EUR-Lex HTML the text was taken from. */
  readonly sha256: string;
  /** Title lines of Implementing Decision (EU) 2018/1523. */
  readonly title: readonly string[];
  /** The 75 blocks of the Annex, in order, identical structure in every language. */
  readonly blocks: readonly (readonly ModelSegment[])[];
}

/** All languages, keyed by lower-case EUR-Lex language code. */
export type ModelStatementData = Readonly<Record<string, ModelStatementLanguage>>;
