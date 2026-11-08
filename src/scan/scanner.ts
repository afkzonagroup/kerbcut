// Copyright 2026 MB AFKzona Group
// SPDX-License-Identifier: AGPL-3.0-only
//
// The crawler and scanner. Breadth-first over same-origin links, one page at
// a time, within the limits. Side effects (browser, network) live here; the
// report is assembled by pure functions in ../report/build.ts.
import type { Browser, BrowserContext, Page, Request } from 'playwright-core';
import { looksLikeFile, normalizeUrl, robotsPath, sameOrigin } from '../crawl/url.js';
import { DEFAULT_EN301549_VERSION, type En301549Version } from '../mapping/index.js';
import { guardedGet, LimitError } from '../net/http.js';
import { isAllowedByRobots, robotsForStatus, ROBOTS_MAX_BYTES, type RobotsTxt } from '../net/robots.js';
import { checkTarget, createSsrfPolicy, SsrfError, type SsrfPolicy } from '../net/ssrf.js';
import { buildReport } from '../report/build.js';
import type { Finding, PageReport, ScanReport, SkippedUrl } from '../report/schema.js';
import { TOOL_NAME } from '../version.js';
import { runAxe } from './axe.js';
import { createScanContext, launchBrowser, PageNetwork } from './browser.js';
import { collectLinks, focusVisibleHeuristic, pageLanguageFinding, readPageLanguage } from './checks.js';
import { axeTagsFor, resolveLimits, type ScanLimits, type ScanOptions } from './options.js';

interface QueueItem {
  readonly url: string;
  readonly depth: number;
}

class Deadline {
  private readonly end: number;
  constructor(ms: number) {
    this.end = Date.now() + ms;
  }
  remaining(): number {
    return Math.max(0, this.end - Date.now());
  }
  expired(): boolean {
    return this.remaining() === 0;
  }
}

async function withTimeout<T>(p: Promise<T>, ms: number, what: string): Promise<T> {
  let timer: NodeJS.Timeout | undefined;
  try {
    return await Promise.race([
      p,
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => {
          reject(new LimitError('time', `${what} took longer than ${ms} ms`));
        }, ms);
      }),
    ]);
  } finally {
    clearTimeout(timer);
  }
}

async function loadRobots(startUrl: string, policy: SsrfPolicy, limits: ScanLimits): Promise<RobotsTxt | 'disallow-all'> {
  const robotsUrl = new URL('/robots.txt', startUrl).href;
  try {
    const res = await guardedGet(robotsUrl, policy, {
      maxBytes: ROBOTS_MAX_BYTES,
      timeoutMs: Math.min(limits.pageTimeoutMs, 15_000),
      maxRedirects: limits.maxRedirects,
    });
    return robotsForStatus(res.status, res.body.toString('utf8'));
  } catch (e) {
    if (e instanceof LimitError && e.limit === 'size') {
      // RFC 9309: content after the size limit may be ignored. We were
      // refused the whole body, so stay on the safe side.
      return 'disallow-all';
    }
    return robotsForStatus(0, '');
  }
}

function errorText(e: unknown): string {
  if (e instanceof SsrfError) return `blocked: ${e.refusal}`;
  if (e instanceof LimitError) return `limit: ${e.message}`;
  if (e instanceof Error) return e.message.split('\n')[0]?.slice(0, 300) ?? 'error';
  return 'error';
}

function pendingRedirect(net: PageNetwork): string | undefined {
  return net.mainRedirect;
}

interface PageOutcome {
  readonly report: PageReport;
  readonly links: readonly string[];
  readonly skip?: SkippedUrl;
}

async function scanOnePage(
  context: BrowserContext,
  item: QueueItem,
  ctx: {
    readonly limits: ScanLimits;
    readonly tags: readonly string[];
    readonly version: En301549Version;
    readonly networks: Map<Page, PageNetwork>;
    readonly startUrl: string;
    readonly timeMs: number;
  },
): Promise<PageOutcome> {
  const page = await context.newPage();
  const net = new PageNetwork();
  ctx.networks.set(page, net);
  const empty = (extra: Partial<PageReport>): PageReport => ({
    url: item.url,
    finalUrl: item.url,
    depth: item.depth,
    violations: [],
    needsReview: [],
    passedRules: 0,
    inapplicableRules: 0,
    accessibilityInfoLinks: [],
    blockedRequests: net.blocked,
    ...extra,
  });
  try {
    page.setDefaultTimeout(ctx.timeMs);
    page.setDefaultNavigationTimeout(ctx.timeMs);
    const work = async (): Promise<PageOutcome> => {
      // Main-document redirects are followed here, one checked hop at a time.
      let target = item.url;
      let response: Awaited<ReturnType<Page['goto']>> = null;
      for (let hop = 0; ; hop++) {
        net.mainRedirect = undefined;
        try {
          response = await page.goto(target, { waitUntil: 'load', timeout: ctx.timeMs });
        } catch (e) {
          if (pendingRedirect(net) === undefined) throw e;
        }
        // Read through a function call: the route handler sets this field
        // while page.goto() runs, which flow analysis cannot see.
        const next = pendingRedirect(net);
        if (next === undefined) break;
        if (hop >= ctx.limits.maxRedirects) throw new LimitError('redirects', 'too many redirects');
        if (!sameOrigin(next, ctx.startUrl)) {
          return {
            report: empty({ finalUrl: next, error: 'redirected to another origin' }),
            links: [],
            skip: { url: item.url, reason: 'other-origin', detail: next.slice(0, 500) },
          };
        }
        target = next;
      }
      const finalUrl = page.url().slice(0, 2048);
      const status = response?.status();
      if (!sameOrigin(finalUrl, ctx.startUrl)) {
        return {
          report: empty({ finalUrl, ...(status !== undefined ? { status } : {}), error: 'redirected to another origin' }),
          links: [],
          skip: { url: item.url, reason: 'other-origin', detail: finalUrl.slice(0, 500) },
        };
      }
      const contentType = (net.mainContentType ?? response?.headers()['content-type'] ?? '').toLowerCase();
      if (!contentType.includes('html')) {
        return {
          report: empty({ finalUrl, ...(status !== undefined ? { status } : {}), error: 'not an HTML page' }),
          links: [],
          skip: { url: item.url, reason: 'not-html', detail: contentType.slice(0, 100) },
        };
      }
      // Cut in the page as well as here, so a huge title is not copied to Node.
      const rawTitle: unknown = await page.evaluate(() => document.title.slice(0, 300));
      const title = typeof rawTitle === 'string' ? rawTitle.slice(0, 300) : '';
      const lang = await readPageLanguage(page);
      const axe = await runAxe(page, { tags: ctx.tags, maxNodes: ctx.limits.maxNodesPerRule, en301549Version: ctx.version });
      const violations: Finding[] = [...axe.violations];
      const needsReview: Finding[] = [...axe.incomplete];
      const axeFoundLang = violations.some((v) => v.ruleId === 'html-has-lang' || v.ruleId === 'html-lang-valid');
      const langFinding = axeFoundLang ? undefined : pageLanguageFinding(lang, ctx.version);
      if (langFinding) violations.push(langFinding);
      const links = await collectLinks(page);
      const focus = await focusVisibleHeuristic(page, ctx.limits.maxFocusChecks, ctx.version);
      if (focus) needsReview.push(focus);
      const report: PageReport = {
        url: item.url,
        finalUrl,
        depth: item.depth,
        ...(status !== undefined ? { status } : {}),
        title,
        ...(lang !== undefined ? { lang } : {}),
        violations,
        needsReview,
        passedRules: axe.passes,
        inapplicableRules: axe.inapplicable,
        accessibilityInfoLinks: links.accessibilityLinks.filter((l) => normalizeUrl(l) !== undefined).slice(0, 20),
        blockedRequests: net.blocked,
        ...(axe.unknownRuleIds.length > 0 ? { warnings: [`page returned unknown axe-core rule ids, ignored: ${axe.unknownRuleIds.join(', ').slice(0, 200)}`] } : {}),
      };
      return { report, links: links.hrefs };
    };
    return await withTimeout(work(), ctx.timeMs + 1_000, 'page');
  } catch (e) {
    const reason = e instanceof SsrfError ? 'blocked' : 'error';
    return { report: empty({ error: errorText(e) }), links: [], skip: { url: item.url, reason, detail: errorText(e) } };
  } finally {
    ctx.networks.delete(page);
    // Close the page and any pop-ups it opened, so nothing it started keeps
    // running while the next page is scanned.
    for (const p of context.pages()) await p.close().catch(() => undefined);
  }
}

/**
 * Crawls and scans a site. Returns a report; never throws for problems with
 * single pages. Throws for an invalid or blocked start URL.
 *
 * @example
 * ```ts
 * import { scan } from '@afkzona/kerbcut';
 * const report = await scan({ startUrl: 'https://example.com/', limits: { maxPages: 5 } });
 * console.log(report.summary.violations);
 * ```
 */
export async function scan(options: ScanOptions, browserOverride?: Browser): Promise<ScanReport> {
  const limits = resolveLimits(options.limits);
  const policy = createSsrfPolicy({
    ...(options.allowedPorts ? { allowedPorts: options.allowedPorts } : {}),
    unsafeAllowLoopbackForTesting: options.unsafeAllowLoopbackForTesting === true,
    ...(options.lookup ? { lookup: options.lookup } : {}),
  });
  const startUrl = normalizeUrl(options.startUrl);
  if (startUrl === undefined) throw new SsrfError('invalid-url', 'start URL must be an absolute http or https URL');
  await checkTarget(startUrl, policy);
  const respectRobots = options.respectRobotsTxt !== false;
  const version = options.en301549Version ?? DEFAULT_EN301549_VERSION;
  const tags = axeTagsFor(options.wcag22 === true);
  const startedAt = new Date();
  const deadline = new Deadline(limits.totalTimeMs);
  const pages: PageReport[] = [];
  const skipped: SkippedUrl[] = [];
  let stoppedEarly: string | undefined;

  const robots = respectRobots ? await loadRobots(startUrl, policy, limits) : undefined;
  const allowedByRobots = (url: string): boolean => {
    if (robots === undefined) return true;
    if (robots === 'disallow-all') return false;
    return isAllowedByRobots(robots, TOOL_NAME, robotsPath(url));
  };

  const browser = browserOverride ?? (await launchBrowser({ sandbox: options.browserSandbox !== false }));
  const browserVersion = `Chromium ${browser.version()}`;
  const networks = new Map<Page, PageNetwork>();
  const context = await createScanContext(browser, {
    policy,
    limits,
    allowNonGet: options.allowNonGetSubrequests === true,
    networkFor: (req: Request) => {
      try {
        return networks.get(req.frame().page());
      } catch {
        return undefined;
      }
    },
  });
  const queue: QueueItem[] = [{ url: startUrl, depth: 0 }];
  const seen = new Set<string>([startUrl]);
  const maxQueue = Math.max(limits.maxPages * 20, 100);
  try {
    while (queue.length > 0) {
      const item = queue.shift();
      if (!item) break;
      if (pages.length >= limits.maxPages) {
        skipped.push({ url: item.url, reason: 'limit-pages' });
        continue;
      }
      if (deadline.expired()) {
        stoppedEarly = 'total time limit reached';
        skipped.push({ url: item.url, reason: 'limit-time' });
        continue;
      }
      if (!allowedByRobots(item.url)) {
        skipped.push({ url: item.url, reason: 'robots' });
        options.onProgress?.({ type: 'page-skipped', url: item.url, reason: 'robots' });
        continue;
      }
      options.onProgress?.({ type: 'page-start', url: item.url, index: pages.length });
      const timeMs = Math.max(1_000, Math.min(limits.pageTimeoutMs, deadline.remaining()));
      const outcome = await scanOnePage(context, item, { limits, tags, version, networks, startUrl, timeMs });
      if (outcome.skip && (outcome.skip.reason === 'not-html' || outcome.skip.reason === 'other-origin')) {
        skipped.push(outcome.skip);
        options.onProgress?.({ type: 'page-skipped', url: item.url, reason: outcome.skip.reason });
      } else {
        pages.push(outcome.report);
        options.onProgress?.({ type: 'page-done', url: item.url, violations: outcome.report.violations.length });
      }
      if (item.depth >= limits.maxDepth) continue;
      for (const href of outcome.links) {
        if (queue.length >= maxQueue) break;
        const n = normalizeUrl(href);
        if (n === undefined || seen.has(n)) continue;
        if (!sameOrigin(n, startUrl) || looksLikeFile(n)) continue;
        // Only queued URLs are remembered, so memory stays bounded by maxQueue.
        seen.add(n);
        queue.push({ url: n, depth: item.depth + 1 });
      }
    }
  } finally {
    await context.close().catch(() => undefined);
    if (!browserOverride) await browser.close().catch(() => undefined);
  }
  if (pages.length >= limits.maxPages && skipped.some((s) => s.reason === 'limit-pages')) {
    stoppedEarly ??= 'page limit reached';
  }
  const finishedAt = new Date();
  return buildReport({
    startUrl,
    startedAt,
    finishedAt,
    respectRobotsTxt: respectRobots,
    limits,
    axeTags: tags,
    browser: browserVersion,
    en301549Version: version,
    pages,
    skipped,
    ...(stoppedEarly !== undefined ? { stoppedEarly } : {}),
  });
}
