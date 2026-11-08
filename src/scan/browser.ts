// Copyright 2026 MB AFKzona Group
// SPDX-License-Identifier: AGPL-3.0-only
//
// Browser set-up. Chromium never talks to the network itself: every request
// is intercepted, checked by the SSRF guard and fetched by Node with the
// checked address pinned; Chromium only receives the response. As defence in
// depth, Chromium's own DNS resolution is switched off, WebSockets, service
// workers, downloads and non-proxied WebRTC are blocked, and no cookies or
// credentials exist in the context.
import { chromium, type Browser, type BrowserContext, type Request, type Route } from 'playwright-core';
import { guardedRequest, isRedirect, LimitError, USER_AGENT, type GuardedResponse } from '../net/http.js';
import { SsrfError, type SsrfPolicy } from '../net/ssrf.js';
import type { ScanLimits } from './options.js';

/** Chromium switches that close side channels to the network. */
export const CHROMIUM_ARGS: readonly string[] = [
  // All host names fail to resolve inside Chromium. Responses come from
  // request interception, which happens before name resolution.
  '--host-resolver-rules=MAP * ~NOTFOUND',
  '--force-webrtc-ip-handling-policy=disable_non_proxied_udp',
  '--webrtc-ip-handling-policy=disable_non_proxied_udp',
  '--disable-background-networking',
  '--disable-component-update',
  '--disable-domain-reliability',
  '--disable-sync',
  '--no-pings',
  '--dns-prefetch-disable',
  '--disable-features=NetworkPrediction,InterestFeedContentSuggestions,MediaRouter,OptimizationHints',
];

/** Thrown when Chromium cannot start with its sandbox. */
export class BrowserSandboxError extends Error {
  override readonly name = 'BrowserSandboxError';
}

/**
 * Launches headless Chromium (Playwright's bundled build). Chromium's own
 * sandbox is on unless `sandbox` is false: the scanned pages are untrusted,
 * and without the sandbox a renderer exploit runs with the user's rights.
 * Some environments (containers without user namespaces, Ubuntu 23.10+ with
 * AppArmor's restriction on unprivileged user namespaces) cannot start the
 * sandbox; there the error says how to proceed.
 */
export async function launchBrowser(opts: { readonly sandbox?: boolean } = {}): Promise<Browser> {
  const sandbox = opts.sandbox !== false;
  try {
    return await chromium.launch({ headless: true, chromiumSandbox: sandbox, args: [...CHROMIUM_ARGS] });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (sandbox && /sandbox|namespace/i.test(msg)) {
      throw new BrowserSandboxError(
        'Chromium could not start its sandbox here. Allow unprivileged user namespaces, or, only inside a disposable container or VM, turn the sandbox off (--no-browser-sandbox, or browserSandbox: false).',
      );
    }
    throw e;
  }
}

/** Per-page network accounting, shared with the route handler. */
export class PageNetwork {
  requests = 0;
  bytes = 0;
  readonly blocked: { url: string; reason: string }[] = [];
  /** Content type of the main document response, if seen. */
  mainContentType: string | undefined;
  /**
   * Set when the main document answered with a redirect. Chromium does not
   * send a fulfilled redirect back through interception, so the scanner
   * follows main-document redirects itself, checking every hop.
   */
  mainRedirect: string | undefined;

  recordBlocked(url: string, reason: string): void {
    if (this.blocked.length < 50) this.blocked.push({ url: url.slice(0, 500), reason });
  }
}

function redirectDepth(req: Request): number {
  let n = 0;
  for (let r = req.redirectedFrom(); r !== null && n < 100; r = r.redirectedFrom()) n++;
  return n;
}

/** Options for the request router. */
export interface RouterOptions {
  readonly policy: SsrfPolicy;
  readonly limits: ScanLimits;
  readonly allowNonGet: boolean;
  /** Returns the accounting object for the page that made the request. */
  readonly networkFor: (req: Request) => PageNetwork | undefined;
}

/**
 * Handles one intercepted request. Exported for tests.
 * - data: and blob: URLs never reach the network and continue.
 * - Every other scheme except http and https is aborted.
 * - http(s) requests are checked and fetched by Node, then fulfilled.
 */
export async function handleRoute(route: Route, opts: RouterOptions): Promise<void> {
  const req = route.request();
  const url = req.url();
  const net = opts.networkFor(req);
  const scheme = url.slice(0, url.indexOf(':') + 1).toLowerCase();
  if (scheme === 'data:' || scheme === 'blob:') {
    await route.continue();
    return;
  }
  if (scheme !== 'http:' && scheme !== 'https:') {
    net?.recordBlocked(url, 'scheme');
    await route.abort('blockedbyclient');
    return;
  }
  if (!net) {
    // Requests from pages the scanner did not open (pop-ups, for example)
    // have no budget, so they are not made at all.
    await route.abort('blockedbyclient');
    return;
  }
  const method = req.method().toUpperCase();
  if (method !== 'GET' && method !== 'HEAD' && !(opts.allowNonGet && method === 'POST')) {
    net.recordBlocked(url, `method ${method}`);
    await route.abort('blockedbyclient');
    return;
  }
  if (redirectDepth(req) > opts.limits.maxRedirects) {
    net.recordBlocked(url, 'too many redirects');
    await route.abort('blockedbyclient');
    return;
  }
  net.requests++;
  if (net.requests > opts.limits.maxRequestsPerPage) {
    net.recordBlocked(url, 'request limit');
    await route.abort('blockedbyclient');
    return;
  }
  const remaining = opts.limits.maxPageBytes - net.bytes;
  if (remaining <= 0) {
    net.recordBlocked(url, 'page size limit');
    await route.abort('blockedbyclient');
    return;
  }
  try {
    const body = method === 'POST' ? req.postDataBuffer() ?? undefined : undefined;
    const isMainDocument = req.isNavigationRequest() && req.frame().parentFrame() === null;
    // Requests run in parallel, so the page budget is charged while bodies
    // stream in, not after each one completes.
    const budget = {
      take: (n: number): boolean => {
        if (net.bytes + n > opts.limits.maxPageBytes) return false;
        net.bytes += n;
        return true;
      },
    };
    const limits = { maxBytes: Math.min(opts.limits.maxResponseBytes, remaining), timeoutMs: opts.limits.pageTimeoutMs, budget };
    let res: GuardedResponse = await guardedRequest(
      { url, method, headers: req.headers(), ...(body ? { body } : {}) },
      opts.policy,
      limits,
    );
    if (isRedirect(res.status) && res.headers.location !== undefined) {
      if (isMainDocument) {
        net.mainRedirect = new URL(res.headers.location, url).href;
        await route.abort('aborted');
        return;
      }
      // Sub-resources: follow here, re-checking every hop, then hand over the final response.
      for (let hop = 0; isRedirect(res.status) && res.headers.location !== undefined; hop++) {
        if (hop >= opts.limits.maxRedirects) throw new LimitError('redirects', 'too many redirects');
        const next = new URL(res.headers.location, res.url).href;
        res = await guardedRequest({ url: next, method: method === 'HEAD' ? 'HEAD' : 'GET', headers: req.headers() }, opts.policy, limits);
      }
    }
    if (isMainDocument) net.mainContentType = res.headers['content-type'];
    const headers = { ...res.headers };
    delete headers.location;
    await route.fulfill({ status: res.status, headers, body: res.body });
  } catch (e) {
    if (e instanceof SsrfError) {
      net.recordBlocked(url, e.refusal);
      await route.abort('blockedbyclient');
      return;
    }
    if (e instanceof LimitError) {
      net.recordBlocked(url, `limit: ${e.limit}`);
      await route.abort('blockedbyclient');
      return;
    }
    await route.abort('failed');
  }
}

/** Creates an isolated context with routing installed. */
export async function createScanContext(browser: Browser, opts: RouterOptions): Promise<BrowserContext> {
  const context = await browser.newContext({
    userAgent: USER_AGENT,
    acceptDownloads: false,
    serviceWorkers: 'block',
    javaScriptEnabled: true,
    ignoreHTTPSErrors: false,
    bypassCSP: false,
    permissions: [],
    viewport: { width: 1280, height: 900 },
  });
  await context.route('**/*', async (route) => {
    try {
      await handleRoute(route, opts);
    } catch {
      // The page may already be closed; nothing else to do.
    }
  });
  await context.routeWebSocket(/.*/, (ws) => {
    void ws.close({ code: 1008, reason: 'blocked by scanner' });
  });
  return context;
}
