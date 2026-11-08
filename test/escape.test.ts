// Copyright 2026 MB AFKzona Group
// SPDX-License-Identifier: AGPL-3.0-only
import { describe, expect, it } from 'vitest';
import { escapeHtml, escapeMarkdown, safeHref } from '../src/util/escape.js';

describe('escapeHtml', () => {
  it('escapes all HTML-significant characters', () => {
    expect(escapeHtml(`<script>alert("x")</script>&'\``)).toBe('&lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt;&amp;&#39;&#96;');
    expect(escapeHtml(42)).toBe('42');
  });
});

describe('safeHref', () => {
  it('only allows http and https', () => {
    expect(safeHref('https://example.com/?a=1&b="2"')).toBe('https://example.com/?a=1&amp;b=%222%22');
    expect(safeHref('javascript:alert(1)')).toBeUndefined();
    expect(safeHref('JaVaScRiPt:alert(1)')).toBeUndefined();
    expect(safeHref('data:text/html,<script>')).toBeUndefined();
    expect(safeHref('https://u:p@example.com/')).toBeUndefined();
    expect(safeHref('not a url')).toBeUndefined();
    expect(safeHref(undefined)).toBeUndefined();
  });
});

describe('escapeMarkdown', () => {
  it('neutralises HTML, links, emphasis and line-start markers', () => {
    expect(escapeMarkdown('<img src=x onerror=alert(1)>')).toBe('&lt;img src=x onerror=alert(1)&gt;');
    expect(escapeMarkdown('[click](javascript:alert(1))')).toBe('\\[click\\](javascript:alert(1))');
    expect(escapeMarkdown('*bold* _em_ `code` | ~')).toBe('\\*bold\\* \\_em\\_ \\`code\\` \\| \\~');
    expect(escapeMarkdown('# heading')).toBe('\\# heading');
    expect(escapeMarkdown('- item')).toBe('\\- item');
    expect(escapeMarkdown('1. item')).toBe('1\\. item');
    expect(escapeMarkdown('a\n# b')).toBe('a # b');
    expect(escapeMarkdown('a\n# b', { multiline: true })).toBe('a\n\\# b');
    expect(escapeMarkdown('-t', { atLineStart: false })).toBe('-t');
  });
});
