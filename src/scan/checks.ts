// Copyright 2026 MB AFKzona Group
// SPDX-License-Identifier: AGPL-3.0-only
//
// Checks that axe-core does not do, and link collection. The functions passed
// to page.evaluate() are constants in this file; page data comes back as
// untrusted values and is validated here.
import type { Page } from 'playwright-core';
import { en301549Clause, type En301549Version } from '../mapping/index.js';
import type { Finding, NodeRef } from '../report/schema.js';

/** Language tag syntax per BCP 47 (RFC 5646), simplified to the common forms. */
const BCP47_RE = /^(?:[a-zA-Z]{2,3}(?:-[a-zA-Z]{3}){0,3}|[a-zA-Z]{4,8})(?:-[a-zA-Z]{4})?(?:-(?:[a-zA-Z]{2}|\d{3}))?(?:-(?:[a-zA-Z\d]{5,8}|\d[a-zA-Z\d]{3}))*(?:-[a-wy-zA-WY-Z\d](?:-[a-zA-Z\d]{2,8})+)*(?:-x(?:-[a-zA-Z\d]{1,8})+)?$/;

/** Is the value a well-formed language tag? */
export function isWellFormedLanguageTag(tag: string): boolean {
  return tag.length <= 35 && BCP47_RE.test(tag);
}

/** Reads the lang attribute of the root element. */
export async function readPageLanguage(page: Page): Promise<string | undefined> {
  const raw: unknown = await page.evaluate(() => {
    const el = document.documentElement;
    return (el.getAttribute('lang') ?? el.getAttribute('xml:lang'))?.slice(0, 100) ?? null;
  });
  return typeof raw === 'string' ? raw.slice(0, 100) : undefined;
}

function clauses(sc: string, version: En301549Version): string[] {
  const c = en301549Clause(sc, version);
  return c ? [c.clause] : [];
}

/**
 * Page language check (WCAG 3.1.1, EN 301 549 9.3.1.1). Returns a finding
 * when the root element has no lang attribute or the value is not a
 * well-formed language tag. It does not check that the tag matches the text.
 */
export function pageLanguageFinding(lang: string | undefined, version: En301549Version): Finding | undefined {
  const value = lang?.trim() ?? '';
  if (value !== '' && isWellFormedLanguageTag(value)) return undefined;
  const nodes: NodeRef[] = [{ target: ['html'], html: value === '' ? '<html>' : `<html lang="${value.slice(0, 40)}">` }];
  return {
    ruleId: 'kerbcut-page-lang',
    source: 'kerbcut',
    impact: 'serious',
    help: value === '' ? 'The html element has no lang attribute' : 'The lang attribute of the html element is not a well-formed language tag',
    wcag: ['3.1.1'],
    en301549: clauses('3.1.1', version),
    heuristic: false,
    nodeCount: 1,
    nodes,
  };
}

/** Raw focus check result from the page. */
interface FocusSample {
  readonly desc: string;
  readonly changed: boolean;
}

/**
 * Focus visible heuristic (WCAG 2.4.7, EN 301 549 9.2.4.7). Moves focus with
 * the Tab key, and for each focused element compares computed styles with
 * and without focus (outline, box shadow, border, background, colour, text
 * decoration, and the same for ::before/::after and the parent). No change
 * means "possibly no visible focus indicator". This is a heuristic: custom
 * indicators drawn in other ways are missed, so results need human review.
 */
export async function focusVisibleHeuristic(page: Page, maxChecks: number, version: En301549Version): Promise<Finding | undefined> {
  if (maxChecks <= 0) return undefined;
  const startUrl = page.url();
  const seen = new Set<string>();
  const failures: NodeRef[] = [];
  let failureCount = 0;
  for (let i = 0; i < maxChecks; i++) {
    await page.keyboard.press('Tab');
    if (page.url() !== startUrl) break;
    const raw: unknown = await page.evaluate(() => {
      const el = document.activeElement;
      if (!el || el === document.body || el === document.documentElement) return null;
      // A visual signature: properties that change how the element looks.
      // Outline and border parts only count when they are drawn at all.
      const snap = (target: Element, pseudo: string | null): string => {
        const cs = getComputedStyle(target, pseudo);
        const v = (p: string): string => cs.getPropertyValue(p);
        const outline = v('outline-style') === 'none' || v('outline-width') === '0px' ? 'none' : [v('outline-style'), v('outline-width'), v('outline-color'), v('outline-offset')].join(' ');
        const border = ['top', 'right', 'bottom', 'left']
          .map((side) => (v(`border-${side}-style`) === 'none' ? 'none' : `${v(`border-${side}-width`)} ${v(`border-${side}-color`)}`))
          .join(',');
        return [outline, border, v('box-shadow'), v('background-color'), v('background-image'), v('color'), v('text-decoration-line'), v('text-decoration-thickness'), v('transform'), v('opacity'), v('filter')].join('|');
      };
      const parent = el.parentElement;
      const take = (): string =>
        [snap(el, null), snap(el, '::before'), snap(el, '::after'), parent ? snap(parent, null) : ''].join('#');
      const focused = take();
      const html = el as HTMLElement;
      html.blur();
      const unfocused = take();
      html.focus({ preventScroll: true });
      const id = el.id ? `#${el.id}` : '';
      const cls = typeof el.className === 'string' && el.className.trim() ? `.${el.className.trim().split(/\s+/).slice(0, 2).join('.')}` : '';
      const own = el.textContent.trim();
      const text = (own !== '' ? own : (el.getAttribute('aria-label') ?? '')).trim().replace(/\s+/g, ' ').slice(0, 60);
      return { desc: `${el.tagName.toLowerCase()}${id}${cls}${text ? ` "${text}"` : ''}`, changed: focused !== unfocused };
    });
    if (typeof raw !== 'object' || raw === null) continue;
    const r = raw as Partial<FocusSample>;
    if (typeof r.desc !== 'string' || typeof r.changed !== 'boolean') continue;
    const desc = r.desc.slice(0, 200);
    if (seen.has(desc)) break; // focus has cycled
    seen.add(desc);
    if (!r.changed) {
      failureCount++;
      if (failures.length < 20) failures.push({ target: [desc], html: '' });
    }
  }
  if (failureCount === 0) return undefined;
  return {
    ruleId: 'kerbcut-focus-visible',
    source: 'kerbcut',
    impact: 'serious',
    help: 'Heuristic: no visible style change was detected when these elements received keyboard focus. Check them by hand.',
    wcag: ['2.4.7'],
    en301549: clauses('2.4.7', version),
    heuristic: true,
    nodeCount: failureCount,
    nodes: failures,
  };
}

/**
 * Words that suggest a link to an accessibility statement or to accessibility
 * information, in the official EU languages. These are search hints for a
 * heuristic, not legal terms.
 */
export const ACCESSIBILITY_LINK_HINTS: readonly string[] = [
  'accessib', 'a11y', 'barrierefrei', 'accessibilit', 'accesibilidad', 'acessibilidade', 'toegankelijk',
  'prieinamum', 'piekļūstam', 'ligipääset', 'juurdepääset', 'saavutettav', 'esteettöm', 'tillgänglighet',
  'tilgængelighed', 'dostępnoś', 'přístupnost', 'prístupnos', 'dostopnost', 'pristupačnost', 'akadálymentes',
  'accesibilitat', 'достъпност', 'προσβασιμότητ', 'aċċessibbiltà', 'inrochtaineacht',
];

/** Collects links on the page: all same-document anchors and candidate accessibility links. */
export async function collectLinks(page: Page): Promise<{ hrefs: string[]; accessibilityLinks: string[] }> {
  const raw: unknown = await page.evaluate((hints: string[]) => {
    const out: string[] = [];
    const a11y: string[] = [];
    const anchors = document.querySelectorAll('a[href], area[href]');
    for (let i = 0; i < anchors.length && i < 5000; i++) {
      const a = anchors[i] as HTMLAnchorElement;
      const href = a.href;
      // Long URLs are dropped in Node anyway; do not copy them out of the page.
      if (typeof href !== 'string' || href.length > 2048) continue;
      out.push(href);
      const label = `${a.textContent} ${a.getAttribute('aria-label') ?? ''} ${a.getAttribute('title') ?? ''} ${href}`.toLowerCase();
      if (hints.some((h) => label.includes(h))) a11y.push(href);
    }
    return { hrefs: out, a11y };
  }, [...ACCESSIBILITY_LINK_HINTS]);
  if (typeof raw !== 'object' || raw === null) return { hrefs: [], accessibilityLinks: [] };
  const rec = raw as Record<string, unknown>;
  const strings = (x: unknown, max: number): string[] =>
    Array.isArray(x) ? (x as unknown[]).filter((s): s is string => typeof s === 'string' && s.length <= 2048).slice(0, max) : [];
  return { hrefs: strings(rec.hrefs, 5000), accessibilityLinks: strings(rec.a11y, 50) };
}
