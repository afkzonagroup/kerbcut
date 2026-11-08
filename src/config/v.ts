// Copyright 2026 MB AFKzona Group
// SPDX-License-Identifier: AGPL-3.0-only
//
// Small hand-written validators for untrusted input (config files, report
// files, data returned by scanned pages). Every validator checks type,
// length and allowed values, and builds a fresh object with only the known
// keys, so "__proto__" and other unexpected keys never reach the program.

/** Thrown when input does not match the expected shape. */
export class ValidationError extends Error {
  override readonly name = 'ValidationError';
  constructor(
    readonly path: string,
    message: string,
  ) {
    super(`${path || '(root)'}: ${message}`);
  }
}

/** A validator turns unknown input into T or throws ValidationError. */
export type Validator<T> = (input: unknown, path: string) => T;

/** Type produced by a validator. */
export type Infer<V> = V extends Validator<infer T> ? T : never;

// Control characters other than tab, line feed and carriage return.
// eslint-disable-next-line no-control-regex -- the point of this pattern is to find control characters
const CONTROL = /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/;

/** String with length limits. Control characters are refused. */
export function str(opts: { min?: number; max: number; pattern?: RegExp; multiline?: boolean }): Validator<string> {
  return (input, path) => {
    if (typeof input !== 'string') throw new ValidationError(path, 'expected a string');
    if (input.length < (opts.min ?? 0)) throw new ValidationError(path, `must be at least ${opts.min ?? 0} characters`);
    if (input.length > opts.max) throw new ValidationError(path, `must be at most ${opts.max} characters`);
    if (CONTROL.test(input)) throw new ValidationError(path, 'contains control characters');
    if (opts.multiline !== true && /[\r\n]/.test(input)) throw new ValidationError(path, 'must be a single line');
    if (opts.pattern && !opts.pattern.test(input)) throw new ValidationError(path, 'has an invalid format');
    return input;
  };
}

/** Integer in a range. */
export function int(opts: { min: number; max: number }): Validator<number> {
  return (input, path) => {
    if (typeof input !== 'number' || !Number.isInteger(input)) throw new ValidationError(path, 'expected an integer');
    if (input < opts.min || input > opts.max) throw new ValidationError(path, `must be between ${opts.min} and ${opts.max}`);
    return input;
  };
}

/** Finite number in a range. */
export function num(opts: { min: number; max: number }): Validator<number> {
  return (input, path) => {
    if (typeof input !== 'number' || !Number.isFinite(input)) throw new ValidationError(path, 'expected a number');
    if (input < opts.min || input > opts.max) throw new ValidationError(path, `must be between ${opts.min} and ${opts.max}`);
    return input;
  };
}

/** Boolean. */
export const bool: Validator<boolean> = (input, path) => {
  if (typeof input !== 'boolean') throw new ValidationError(path, 'expected true or false');
  return input;
};

/** One of a fixed set of strings. */
export function oneOf<const T extends string>(values: readonly T[]): Validator<T> {
  return (input, path) => {
    if (typeof input !== 'string' || !(values as readonly string[]).includes(input)) {
      throw new ValidationError(path, `must be one of: ${values.join(', ')}`);
    }
    return input as T;
  };
}

/** Array with a length limit. */
export function arr<T>(item: Validator<T>, opts: { max: number; min?: number }): Validator<readonly T[]> {
  return (input, path) => {
    if (!Array.isArray(input)) throw new ValidationError(path, 'expected an array');
    if (input.length > opts.max) throw new ValidationError(path, `must have at most ${opts.max} items`);
    if (input.length < (opts.min ?? 0)) throw new ValidationError(path, `must have at least ${opts.min ?? 0} items`);
    return input.map((x: unknown, i) => item(x, `${path}[${i}]`));
  };
}

/** Marks an object property as optional. */
export interface Optional<T> {
  readonly optional: true;
  readonly validator: Validator<T>;
}

/** Wraps a validator to mark the property optional. */
export function opt<T>(validator: Validator<T>): Optional<T> {
  return { optional: true, validator };
}

type Shape = Record<string, Validator<unknown> | Optional<unknown>>;
type RequiredKeys<S extends Shape> = { [K in keyof S]: S[K] extends Optional<unknown> ? never : K }[keyof S];
type OptionalKeys<S extends Shape> = { [K in keyof S]: S[K] extends Optional<unknown> ? K : never }[keyof S];
type ShapeOut<S extends Shape> = {
  [K in RequiredKeys<S>]: S[K] extends Validator<infer T> ? T : never;
} & {
  [K in OptionalKeys<S>]?: S[K] extends Optional<infer T> ? T : never;
};

function isPlainObject(x: unknown): x is Record<string, unknown> {
  if (typeof x !== 'object' || x === null || Array.isArray(x)) return false;
  const proto = Object.getPrototypeOf(x) as unknown;
  return proto === Object.prototype || proto === null;
}

/**
 * Object with known keys. Unknown keys are refused (strict), so typos in a
 * config file are reported instead of silently ignored.
 */
export function obj<S extends Shape>(shape: S, opts: { strict?: boolean } = {}): Validator<ShapeOut<S>> {
  const strict = opts.strict ?? true;
  return (input, path) => {
    if (!isPlainObject(input)) throw new ValidationError(path, 'expected an object');
    const out: Record<string, unknown> = Object.create(null) as Record<string, unknown>;
    for (const key of Object.keys(input)) {
      if (strict && !Object.prototype.hasOwnProperty.call(shape, key)) {
        throw new ValidationError(path, `unknown property "${key}"`);
      }
    }
    for (const [key, spec] of Object.entries(shape)) {
      const has = Object.prototype.hasOwnProperty.call(input, key);
      const value = has ? input[key] : undefined;
      const p = path ? `${path}.${key}` : key;
      if ('optional' in spec) {
        if (value === undefined) continue;
        out[key] = spec.validator(value, p);
      } else {
        if (!has) throw new ValidationError(p, 'is required');
        out[key] = spec(value, p);
      }
    }
    // Return a normal object; keys are only the known ones.
    return { ...out } as ShapeOut<S>;
  };
}

/** Record with validated string keys and values. */
export function record<T>(key: Validator<string>, value: Validator<T>, opts: { max: number }): Validator<Record<string, T>> {
  return (input, path) => {
    if (!isPlainObject(input)) throw new ValidationError(path, 'expected an object');
    const keys = Object.keys(input);
    if (keys.length > opts.max) throw new ValidationError(path, `must have at most ${opts.max} entries`);
    const out = new Map<string, T>();
    for (const k of keys) {
      const kk = key(k, `${path}{key}`);
      out.set(kk, value(input[k], `${path}.${k}`));
    }
    return Object.fromEntries(out);
  };
}

/** http(s) URL string. */
export function httpUrl(opts: { max: number } = { max: 2048 }): Validator<string> {
  const base = str({ max: opts.max, min: 1 });
  return (input, path) => {
    const s = base(input, path);
    let u: URL;
    try {
      u = new URL(s);
    } catch {
      throw new ValidationError(path, 'must be an absolute URL');
    }
    if (u.protocol !== 'http:' && u.protocol !== 'https:') throw new ValidationError(path, 'must be an http or https URL');
    if (u.username !== '' || u.password !== '') throw new ValidationError(path, 'must not contain credentials');
    return u.href;
  };
}

/** Calendar date in ISO 8601 form YYYY-MM-DD, checked for a real day. */
export const isoDate: Validator<string> = (input, path) => {
  const s = str({ max: 10, pattern: /^\d{4}-\d{2}-\d{2}$/ })(input, path);
  const [y, m, d] = s.split('-').map(Number) as [number, number, number];
  const date = new Date(Date.UTC(y, m - 1, d));
  if (date.getUTCFullYear() !== y || date.getUTCMonth() !== m - 1 || date.getUTCDate() !== d) {
    throw new ValidationError(path, 'is not a real calendar date');
  }
  return s;
};
