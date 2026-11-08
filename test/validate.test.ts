// Copyright 2026 MB AFKzona Group
// SPDX-License-Identifier: AGPL-3.0-only
import { describe, expect, it } from 'vitest';
import { arr, bool, httpUrl, int, isoDate, num, obj, oneOf, opt, record, str, ValidationError } from '../src/config/v.js';

describe('validators', () => {
  it('str checks type, length, control characters and lines', () => {
    const v = str({ min: 1, max: 5 });
    expect(v('abc', 'p')).toBe('abc');
    expect(() => v(1, 'p')).toThrow(ValidationError);
    expect(() => v('', 'p')).toThrow(/at least/);
    expect(() => v('abcdef', 'p')).toThrow(/at most/);
    expect(() => v('a\u0000b', 'p')).toThrow(/control/);
    expect(() => v('a\nb', 'p')).toThrow(/single line/);
    expect(str({ max: 5, multiline: true })('a\nb', 'p')).toBe('a\nb');
    expect(() => str({ max: 5, pattern: /^a+$/ })('b', 'p')).toThrow(/format/);
  });
  it('int, num, bool, oneOf', () => {
    expect(int({ min: 0, max: 3 })(2, 'p')).toBe(2);
    expect(() => int({ min: 0, max: 3 })(2.5, 'p')).toThrow();
    expect(() => int({ min: 0, max: 3 })(4, 'p')).toThrow();
    expect(num({ min: 0, max: 1 })(0.5, 'p')).toBe(0.5);
    expect(() => num({ min: 0, max: 1 })(Number.NaN, 'p')).toThrow();
    expect(() => num({ min: 0, max: 1 })(2, 'p')).toThrow();
    expect(bool(true, 'p')).toBe(true);
    expect(() => bool('true', 'p')).toThrow();
    expect(oneOf(['a', 'b'] as const)('a', 'p')).toBe('a');
    expect(() => oneOf(['a', 'b'] as const)('c', 'p')).toThrow(/one of/);
  });
  it('arr limits length and reports item paths', () => {
    const v = arr(int({ min: 0, max: 9 }), { max: 2, min: 1 });
    expect(v([1, 2], 'list')).toEqual([1, 2]);
    expect(() => v([], 'list')).toThrow(/at least/);
    expect(() => v([1, 2, 3], 'list')).toThrow(/at most/);
    expect(() => v([1, 'x'], 'list')).toThrow(/list\[1\]/);
    expect(() => v('x', 'list')).toThrow(/array/);
  });
  it('obj refuses unknown keys, keeps only known keys and blocks prototype pollution', () => {
    const v = obj({ a: str({ max: 5 }), b: opt(int({ min: 0, max: 9 })) });
    expect(v({ a: 'x' }, '')).toEqual({ a: 'x' });
    expect(() => v({ a: 'x', c: 1 }, '')).toThrow(/unknown property "c"/);
    expect(() => v({}, '')).toThrow(/is required/);
    expect(() => v(JSON.parse('{"a":"x","__proto__":{"polluted":true}}'), '')).toThrow(/unknown property "__proto__"/);
    const loose = obj({ a: str({ max: 5 }) }, { strict: false });
    const out = loose(JSON.parse('{"a":"x","__proto__":{"polluted":true}}'), '');
    expect(Object.keys(out)).toEqual(['a']);
    expect(({} as Record<string, unknown>).polluted).toBeUndefined();
    expect(() => v([], '')).toThrow(/object/);
    expect(() => v(new Date(), '')).toThrow(/object/);
    expect(() => v(null, '')).toThrow(/object/);
  });
  it('record validates keys and values', () => {
    const v = record(str({ max: 3, pattern: /^[a-z]+$/ }), str({ max: 3 }), { max: 2 });
    expect(v({ ab: 'x' }, 'r')).toEqual({ ab: 'x' });
    expect(() => v({ AB: 'x' }, 'r')).toThrow();
    expect(() => v({ a: 'x', b: 'y', c: 'z' }, 'r')).toThrow(/at most/);
    expect(() => v([], 'r')).toThrow(/object/);
  });
  it('httpUrl accepts http(s) only, without credentials', () => {
    const v = httpUrl();
    expect(v('https://example.com/a b', 'u')).toBe('https://example.com/a%20b');
    expect(() => v('javascript:alert(1)', 'u')).toThrow(/http/);
    expect(() => v('https://u:p@example.com/', 'u')).toThrow(/credentials/);
    expect(() => v('relative/path', 'u')).toThrow(/absolute/);
  });
  it('isoDate checks real calendar days', () => {
    expect(isoDate('2025-06-28', 'd')).toBe('2025-06-28');
    expect(isoDate('2028-02-29', 'd')).toBe('2028-02-29');
    expect(() => isoDate('2027-02-29', 'd')).toThrow(/real calendar date/);
    expect(() => isoDate('2025-13-01', 'd')).toThrow();
    expect(() => isoDate('28.06.2025', 'd')).toThrow();
  });
});
