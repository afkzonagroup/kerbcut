// Copyright 2026 MB AFKzona Group
// SPDX-License-Identifier: AGPL-3.0-only
//
// Repository hygiene: no invisible or bidirectional control characters
// (Trojan Source, CVE-2021-42574).
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const ROOT = new URL('..', import.meta.url).pathname;
const SKIP = new Set(['node_modules', '.git', 'dist', 'dist-check', 'coverage']);
// Bidi embeddings/overrides/isolates, line/paragraph separators, zero-width characters, BOM, NUL.
const FORBIDDEN_RANGES: readonly (readonly [number, number])[] = [
  [0x202a, 0x202e],
  [0x2066, 0x2069],
  [0x2028, 0x2029],
  [0x200b, 0x200f],
  [0xfeff, 0xfeff],
  [0x0000, 0x0000],
];
// Built from code points so that this file itself contains none of them.
const hex = (n: number): string => `\\u${n.toString(16).padStart(4, '0')}`;
const FORBIDDEN = new RegExp(`[${FORBIDDEN_RANGES.map(([a, b]) => (a === b ? hex(a) : `${hex(a)}-${hex(b)}`)).join('')}]`, 'u');

function files(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    if (SKIP.has(name)) continue;
    const p = join(dir, name);
    if (statSync(p).isDirectory()) out.push(...files(p));
    else out.push(p);
  }
  return out;
}

describe('repository hygiene', () => {
  const all = files(ROOT);
  it('scans a meaningful number of files', () => {
    expect(all.length).toBeGreaterThan(50);
  });
  it('has no invisible or bidirectional control characters in any text file', () => {
    const hits: string[] = [];
    for (const f of all) {
      const text = readFileSync(f, 'utf8');
      const m = FORBIDDEN.exec(text);
      if (m) hits.push(`${f.slice(ROOT.length)}: U+${m[0].codePointAt(0)!.toString(16).toUpperCase().padStart(4, '0')}`);
    }
    expect(hits).toEqual([]);
  });
});
