// Copyright 2026 MB AFKzona Group
// SPDX-License-Identifier: AGPL-3.0-only

/** The 24 official EU languages (lower-case EUR-Lex codes; "el" is Greek). */
export const EU_LANGUAGES = [
  'bg', 'es', 'cs', 'da', 'de', 'et', 'el', 'en', 'fr', 'ga', 'hr', 'it',
  'lv', 'lt', 'hu', 'mt', 'nl', 'pl', 'pt', 'ro', 'sk', 'sl', 'fi', 'sv',
] as const;

/** An official EU language code. */
export type EuLanguage = (typeof EU_LANGUAGES)[number];
