// Copyright 2026 MB AFKzona Group
// SPDX-License-Identifier: AGPL-3.0-only
import { chromium, type Browser, type Request, type Route } from 'playwright-core';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createSsrfPolicy } from '../src/net/ssrf.js';
import { BrowserSandboxError, CHROMIUM_ARGS, handleRoute, launchBrowser, PageNetwork } from '../src/scan/browser.js';
import { DEFAULT_LIMITS } from '../src/scan/options.js';
import { scan } from '../src/scan/scanner.js';

function fakeRoute(url: string, method = 'GET', redirects = 0): { route: Route; abort: ReturnType<typeof vi.fn>; cont: ReturnType<typeof vi.fn>; fulfill: ReturnType<typeof vi.fn> } {
  const abort = vi.fn(() => Promise.resolve());
  const cont = vi.fn(() => Promise.resolve());
  const fulfill = vi.fn(() => Promise.resolve());
  const req = {
    url: () => url,
    method: () => method,
    headers: () => ({}),
    redirectedFrom: () => (redirects > 0 ? fakeRoute(url, method, redirects - 1).route.request() : null),
    isNavigationRequest: () => false,
    postDataBuffer: () => null,
  } as unknown as Request;
  const route = { request: () => req, abort, continue: cont, fulfill } as unknown as Route;
  return { route, abort, cont, fulfill };
}

const opts = (net: PageNetwork | undefined) => ({
  policy: createSsrfPolicy({ lookup: () => Promise.resolve([{ address: '10.0.0.1', family: 4 as const }]) }),
  limits: DEFAULT_LIMITS,
  allowNonGet: false,
  networkFor: () => net,
});

describe('request routing', () => {
  it('aborts requests from pages the scanner did not open (pop-ups)', async () => {
    const r = fakeRoute('https://public.example/');
    await handleRoute(r.route, opts(undefined));
    expect(r.abort).toHaveBeenCalledWith('blockedbyclient');
    expect(r.fulfill).not.toHaveBeenCalled();
  });
  it('lets data: and blob: URLs continue and aborts other schemes', async () => {
    const d = fakeRoute('data:text/plain,x');
    await handleRoute(d.route, opts(new PageNetwork()));
    expect(d.cont).toHaveBeenCalled();
    const f = fakeRoute('file:///etc/passwd');
    const net = new PageNetwork();
    await handleRoute(f.route, opts(net));
    expect(f.abort).toHaveBeenCalledWith('blockedbyclient');
    expect(net.blocked).toEqual([{ url: 'file:///etc/passwd', reason: 'scheme' }]);
  });
  it('blocks POST unless allowed, and blocks private addresses', async () => {
    const net = new PageNetwork();
    const p = fakeRoute('https://public.example/api', 'POST');
    await handleRoute(p.route, opts(net));
    expect(net.blocked[0]?.reason).toBe('method POST');
    const g = fakeRoute('https://resolves-private.example/');
    await handleRoute(g.route, opts(net));
    expect(net.blocked[1]?.reason).toBe('private');
    expect(g.fulfill).not.toHaveBeenCalled();
  });
  it('enforces the request budget per page', async () => {
    const net = new PageNetwork();
    net.requests = DEFAULT_LIMITS.maxRequestsPerPage;
    const r = fakeRoute('https://public.example/x');
    await handleRoute(r.route, opts(net));
    expect(net.blocked[0]?.reason).toBe('request limit');
  });
  it('refuses chains with too many redirect hops', async () => {
    const net = new PageNetwork();
    const r = fakeRoute('https://public.example/x', 'GET', DEFAULT_LIMITS.maxRedirects + 1);
    await handleRoute(r.route, opts(net));
    expect(net.blocked[0]?.reason).toBe('too many redirects');
    expect(r.fulfill).not.toHaveBeenCalled();
  });
  it('switches off Chromium name resolution and side channels', () => {
    expect(CHROMIUM_ARGS).toContain('--host-resolver-rules=MAP * ~NOTFOUND');
    expect(CHROMIUM_ARGS).toContain('--force-webrtc-ip-handling-policy=disable_non_proxied_udp');
  });
});

describe('browser launch', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });
  it('starts Chromium with its sandbox by default and without it only when asked', async () => {
    const launch = vi.spyOn(chromium, 'launch').mockResolvedValue({} as Browser);
    await launchBrowser();
    expect(launch.mock.calls[0]?.[0]).toMatchObject({ headless: true, chromiumSandbox: true });
    await launchBrowser({ sandbox: false });
    expect(launch.mock.calls[1]?.[0]).toMatchObject({ chromiumSandbox: false });
  });
  it('scan() passes the browserSandbox option to the launch (default on)', async () => {
    const launch = vi.spyOn(chromium, 'launch').mockRejectedValue(new Error('stop here'));
    const base = { startUrl: 'https://public.example/', respectRobotsTxt: false, lookup: () => Promise.resolve([{ address: '93.184.215.14', family: 4 as const }]) };
    await expect(scan(base)).rejects.toThrow('stop here');
    await expect(scan({ ...base, browserSandbox: false })).rejects.toThrow('stop here');
    expect(launch.mock.calls.map((c) => c[0]?.chromiumSandbox)).toEqual([true, false]);
  });
  it('explains a sandbox start failure and passes other errors through', async () => {
    vi.spyOn(chromium, 'launch').mockRejectedValueOnce(new Error('Chromium sandboxing failed!')).mockRejectedValueOnce(new Error('other'));
    await expect(launchBrowser()).rejects.toBeInstanceOf(BrowserSandboxError);
    await expect(launchBrowser()).rejects.toThrow('other');
  });
});
