// Copyright 2026 MB AFKzona Group
// SPDX-License-Identifier: AGPL-3.0-only
//
// Output encoding for HTML and Markdown. Every value that did not come from
// this program's own constants goes through one of these functions.

const HTML_ESCAPES: Readonly<Record<string, string>> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
  '`': '&#96;',
};

/** Escapes text for HTML element content and quoted attribute values. */
export function escapeHtml(value: unknown): string {
  return String(value).replace(/[&<>"'`]/g, (c) => HTML_ESCAPES[c] ?? c);
}

/**
 * Returns an escaped href for http(s) URLs and undefined for anything else,
 * so "javascript:", "data:" and similar URLs never become links.
 */
export function safeHref(url: string | undefined): string | undefined {
  if (url === undefined) return undefined;
  try {
    const u = new URL(url);
    if (u.protocol !== 'http:' && u.protocol !== 'https:') return undefined;
    if (u.username !== '' || u.password !== '') return undefined;
    return escapeHtml(u.href);
  } catch {
    return undefined;
  }
}

/**
 * Escapes text for Markdown so it renders as plain text: HTML is turned into
 * entities, inline Markdown punctuation is backslash-escaped, and line-start
 * markers (headings, lists, quotes, rules) are neutralised. Line breaks
 * become spaces unless multiline is set. Set atLineStart to false when the
 * text continues a line that already has content.
 */
export function escapeMarkdown(value: string, opts: { multiline?: boolean; atLineStart?: boolean } = {}): string {
  const s = opts.multiline === true ? value.replace(/\r\n?/g, '\n') : value.replace(/[\r\n]+/g, ' ');
  return s
    .split('\n')
    .map((line, i) => {
      const inline = line
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/([\\`*_[\]|~])/g, '\\$1');
      if (i === 0 && opts.atLineStart === false) return inline;
      return inline.replace(/^(\s*)([#+=-])/, '$1\\$2').replace(/^(\s*\d+)([.)])/, '$1\\$2');
    })
    .join('\n');
}
