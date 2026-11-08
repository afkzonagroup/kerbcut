// Copyright 2026 MB AFKzona Group
// SPDX-License-Identifier: AGPL-3.0-only
//
// Runs axe-core in a page and turns its results into findings. The page is
// untrusted: a hostile page can replace window.axe or change built-ins and
// return anything. So every value that comes back is validated, capped in
// size, and rule ids must be known axe-core rules. Rule descriptions come
// from axe-core's metadata in Node, never from the page.
import { createRequire } from 'node:module';
import type { Frame, Page } from 'playwright-core';
import { isKnownAxeRule, mapAxeRule, type En301549Version } from '../mapping/index.js';
import type { Finding, Impact, NodeRef } from '../report/schema.js';

const require = createRequire(import.meta.url);

interface AxeModule {
  readonly source: string;
  readonly version: string;
  getRules(): { ruleId: string; description: string; help: string; helpUrl: string; tags: string[] }[];
}

const axeCore = require('axe-core') as AxeModule;

/** Version of the bundled axe-core. */
export const AXE_VERSION = axeCore.version;

const RULE_HELP = new Map(axeCore.getRules().map((r) => [r.ruleId, { help: r.help, helpUrl: r.helpUrl }]));

const IMPACTS: readonly Impact[] = ['minor', 'moderate', 'serious', 'critical'];

/** Raw result shape we accept from the page (after validation). */
interface RawRule {
  id: string;
  impact: Impact | undefined;
  nodes: NodeRef[];
  nodeCount: number;
}

/** Raw result of one axe run. */
export interface AxeRunResult {
  readonly violations: readonly Finding[];
  readonly incomplete: readonly Finding[];
  readonly passes: number;
  readonly inapplicable: number;
  /** Rule ids the page returned that are not axe-core rules (sign of tampering). */
  readonly unknownRuleIds: readonly string[];
}

function cut(s: string, max: number): string {
  return s.length > max ? `${s.slice(0, max - 1)}…` : s;
}

function asString(x: unknown, max: number): string | undefined {
  return typeof x === 'string' ? cut(x, max) : undefined;
}

/** Validates the untrusted rule list returned by the page. Exported for tests. */
export function sanitizeRules(input: unknown, maxNodes: number, unknown: string[]): RawRule[] {
  if (!Array.isArray(input)) return [];
  const out: RawRule[] = [];
  for (const item of input.slice(0, 300) as unknown[]) {
    if (typeof item !== 'object' || item === null) continue;
    const rec = item as Record<string, unknown>;
    const id = asString(rec.id, 100);
    if (id === undefined) continue;
    if (!isKnownAxeRule(id)) {
      if (unknown.length < 20) unknown.push(id);
      continue;
    }
    const impact = IMPACTS.find((i) => i === rec.impact);
    const rawNodes = Array.isArray(rec.nodes) ? (rec.nodes as unknown[]) : [];
    const nodes: NodeRef[] = [];
    for (const n of rawNodes.slice(0, maxNodes)) {
      if (typeof n !== 'object' || n === null) continue;
      const nr = n as Record<string, unknown>;
      const target = Array.isArray(nr.target)
        ? (nr.target as unknown[])
            .slice(0, 5)
            .map((t) => (typeof t === 'string' ? cut(t, 300) : Array.isArray(t) ? cut((t as unknown[]).filter((x) => typeof x === 'string').join(' '), 300) : ''))
            .filter((t) => t !== '')
        : [];
      const html = asString(nr.html, 300) ?? '';
      const summary = asString(nr.failureSummary, 600);
      nodes.push(summary === undefined ? { target, html } : { target, html, summary });
    }
    out.push({ id, impact, nodes, nodeCount: Math.min(rawNodes.length, 100_000) });
  }
  return out;
}

function toFinding(r: RawRule, version: En301549Version): Finding {
  const map = mapAxeRule(r.id, version);
  const meta = RULE_HELP.get(r.id);
  const base = {
    ruleId: r.id,
    source: 'axe' as const,
    help: meta?.help ?? r.id,
    wcag: map?.wcag ?? [],
    en301549: map?.en301549 ?? [],
    heuristic: false,
    nodeCount: r.nodeCount,
    nodes: r.nodes,
  };
  const withUrl = meta?.helpUrl ? { ...base, helpUrl: meta.helpUrl } : base;
  return r.impact ? { ...withUrl, impact: r.impact } : withUrl;
}

async function injectAxe(frame: Frame): Promise<void> {
  // axe-core's own source, a constant from the installed package.
  await frame.evaluate(axeCore.source);
}

/** Injects axe-core into every frame and runs it from the top frame. */
export async function runAxe(page: Page, opts: { tags: readonly string[]; maxNodes: number; en301549Version: En301549Version }): Promise<AxeRunResult> {
  for (const frame of page.frames()) {
    try {
      await injectAxe(frame);
    } catch {
      // Frames that navigate or close during injection are skipped.
    }
  }
  const raw: unknown = await page.evaluate(async (tags: string[]) => {
    const w = window as unknown as { axe?: { run: (ctx: Document, o: object) => Promise<Record<string, unknown>> } };
    if (!w.axe) return null;
    const r = await w.axe.run(document, {
      runOnly: { type: 'tag', values: tags },
      resultTypes: ['violations', 'incomplete'],
      frameWaitTime: 5000,
      elementRef: false,
      selectors: true,
      ancestry: false,
      xpath: false,
    });
    const strip = (list: unknown): unknown[] =>
      Array.isArray(list)
        ? list.map((x: Record<string, unknown>) => ({
            id: x.id,
            impact: x.impact,
            nodes: Array.isArray(x.nodes)
              ? x.nodes.map((n: Record<string, unknown>) => ({ target: n.target, html: n.html, failureSummary: n.failureSummary }))
              : [],
          }))
        : [];
    return {
      violations: strip(r.violations),
      incomplete: strip(r.incomplete),
      passes: Array.isArray(r.passes) ? r.passes.length : 0,
      inapplicable: Array.isArray(r.inapplicable) ? r.inapplicable.length : 0,
    };
  }, [...opts.tags]);
  if (typeof raw !== 'object' || raw === null) throw new Error('axe-core did not run in the page');
  const rec = raw as Record<string, unknown>;
  const unknownIds: string[] = [];
  const violations = sanitizeRules(rec.violations, opts.maxNodes, unknownIds).map((r) => toFinding(r, opts.en301549Version));
  const incomplete = sanitizeRules(rec.incomplete, opts.maxNodes, unknownIds).map((r) => toFinding(r, opts.en301549Version));
  const count = (x: unknown): number => (typeof x === 'number' && Number.isInteger(x) && x >= 0 && x < 10_000 ? x : 0);
  return { violations, incomplete, passes: count(rec.passes), inapplicable: count(rec.inapplicable), unknownRuleIds: unknownIds };
}
