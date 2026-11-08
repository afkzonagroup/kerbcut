// Copyright 2026 MB AFKzona Group
// SPDX-License-Identifier: AGPL-3.0-only
//
// A minimal JSON Schema (2020-12 subset) checker for tests: type, const,
// enum, required, properties, additionalProperties: false, items, $ref to
// "#/$defs/...", minimum, pattern. Enough to check the report schema.

type Schema = Record<string, unknown>;

function typeOf(v: unknown): string {
  if (v === null) return 'null';
  if (Array.isArray(v)) return 'array';
  if (typeof v === 'number') return Number.isInteger(v) ? 'integer' : 'number';
  return typeof v;
}

export function validateAgainstSchema(root: unknown, value: unknown): string[] {
  const errors: string[] = [];
  const defs = ((root as Schema).$defs ?? {}) as Record<string, Schema>;
  const walk = (schema: Schema, v: unknown, path: string): void => {
    if (typeof schema.$ref === 'string') {
      const name = schema.$ref.replace('#/$defs/', '');
      const target = defs[name];
      if (!target) {
        errors.push(`${path}: unknown $ref ${schema.$ref}`);
        return;
      }
      walk(target, v, path);
      return;
    }
    if (schema.type !== undefined) {
      const types = Array.isArray(schema.type) ? (schema.type as string[]) : [schema.type as string];
      const t = typeOf(v);
      if (!types.includes(t) && !(t === 'integer' && types.includes('number'))) {
        errors.push(`${path}: expected ${types.join('|')}, got ${t}`);
        return;
      }
    }
    if ('const' in schema && v !== schema.const) errors.push(`${path}: expected const ${String(schema.const)}`);
    if (Array.isArray(schema.enum) && !schema.enum.includes(v)) errors.push(`${path}: not in enum`);
    if (typeof schema.minimum === 'number' && typeof v === 'number' && v < schema.minimum) errors.push(`${path}: below minimum`);
    if (typeof schema.pattern === 'string' && typeof v === 'string' && !new RegExp(schema.pattern, 'u').test(v)) errors.push(`${path}: pattern`);
    if (typeOf(v) === 'object') {
      const obj = v as Record<string, unknown>;
      const props = (schema.properties ?? {}) as Record<string, Schema>;
      for (const r of (schema.required ?? []) as string[]) if (!(r in obj)) errors.push(`${path}.${r}: required`);
      for (const [k, val] of Object.entries(obj)) {
        const p = props[k];
        if (p) walk(p, val, `${path}.${k}`);
        else if (schema.additionalProperties === false) errors.push(`${path}.${k}: not allowed`);
        else if (typeof schema.additionalProperties === 'object') walk(schema.additionalProperties as Schema, val, `${path}.${k}`);
      }
    }
    if (Array.isArray(v) && typeof schema.items === 'object') {
      v.forEach((item, i) => {
        walk(schema.items as Schema, item, `${path}[${i}]`);
      });
    }
  };
  walk(root as Schema, value, '$');
  return errors;
}
