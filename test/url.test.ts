// Copyright 2026 MB AFKzona Group
// SPDX-License-Identifier: AGPL-3.0-only
import { describe, expect, it } from 'vitest';
import { looksLikeFile, normalizeUrl, robotsPath, sameOrigin } from '../src/crawl/url.js';

describe('crawler URL helpers', () => {
  it('normalises and drops fragments', () => {
    expect(normalizeUrl('HTTP://Example.COM:80/a#x')).toBe('http://example.com/a');
    expect(normalizeUrl('/b?c=1#d', 'https://example.com/a')).toBe('https://example.com/b?c=1');
  });
  it('refuses non-http URLs, credentials and very long URLs', () => {
    expect(normalizeUrl('mailto:a@b.c')).toBeUndefined();
    expect(normalizeUrl('javascript:void(0)')).toBeUndefined();
    expect(normalizeUrl('http://u:p@example.com/')).toBeUndefined();
    expect(normalizeUrl(`https://example.com/${'a'.repeat(3000)}`)).toBeUndefined();
    expect(normalizeUrl(`https://example.com/${'a'.repeat(2030)}`)).toBeUndefined();
    expect(normalizeUrl('::::')).toBeUndefined();
  });
  it('compares origins', () => {
    expect(sameOrigin('https://a.example/x', 'https://a.example/y')).toBe(true);
    expect(sameOrigin('https://a.example/', 'http://a.example/')).toBe(false);
    expect(sameOrigin('https://a.example/', 'https://a.example:8443/')).toBe(false);
    expect(sameOrigin('https://a.example/', 'https://b.a.example/')).toBe(false);
    expect(sameOrigin('bad', 'https://a.example/')).toBe(false);
  });
  it('recognises file links', () => {
    expect(looksLikeFile('https://a.example/doc.PDF')).toBe(true);
    expect(looksLikeFile('https://a.example/img.png?x=1')).toBe(true);
    expect(looksLikeFile('https://a.example/page.html')).toBe(false);
    expect(looksLikeFile('https://a.example/dir/')).toBe(false);
    expect(looksLikeFile('nope')).toBe(true);
  });
  it('gives path and query for robots.txt', () => {
    expect(robotsPath('https://a.example/x/y?z=1#f')).toBe('/x/y?z=1');
  });
});
