// Copyright 2026 MB AFKzona Group
// SPDX-License-Identifier: AGPL-3.0-only
//
// Integration tests: real Chromium (Playwright's bundled build) against a
// local test server. Loopback is reachable only through the explicit
// test-only switch.
import { chromium, type Browser } from 'playwright-core';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { SsrfError, type LookupFn } from '../src/net/ssrf.js';
import { createScanContext, launchBrowser, PageNetwork } from '../src/scan/browser.js';
import { createSsrfPolicy } from '../src/net/ssrf.js';
import { DEFAULT_LIMITS } from '../src/scan/options.js';
import type { ScanOptions } from '../src/scan/options.js';
import { scan } from '../src/scan/scanner.js';
import { html, redirect, startServer, type Handler, type TestServer } from './helpers/server.js';

let srv: TestServer;
let browser: Browser;
let rebindCalls = 0;

const lookup: LookupFn = (host) => {
  if (host === 'internal.test') return Promise.resolve([{ address: '10.0.0.5', family: 4 }]);
  if (host === 'rebind.test') {
    rebindCalls++;
    return Promise.resolve([{ address: rebindCalls === 1 ? '127.0.0.1' : '10.0.0.9', family: 4 }]);
  }
  return Promise.reject(new Error('ENOTFOUND'));
};

function opts(over: Partial<ScanOptions> = {}): ScanOptions {
  return {
    startUrl: `${srv.origin}/`,
    allowedPorts: [80, srv.port],
    unsafeAllowLoopbackForTesting: true,
    lookup,
    ...over,
    limits: { maxFocusChecks: 3, pageTimeoutMs: 15_000, ...over.limits },
  };
}

beforeAll(async () => {
  // Routes are read at request time, so they can be filled in after the port is known.
  const handlers: Record<string, Handler> = {};
  srv = await startServer(handlers);
  const p = srv.port;
  const home = `<!doctype html><html><head><title>Home</title></head><body>
<a href="/a">A</a> <a href="/b">B</a> <a href="/deep/1">Deep</a> <a href="/file.pdf">PDF</a>
<a href="http://other.example/">Other site</a> <a href="/redir-same">Moved</a> <a href="/redir-other">Away</a>
<a href="/private">Private</a> <a href="/json">JSON</a> <a href="/accessibility-statement">Accessibility statement</a>
<img src="/logo.png"><button></button>
<img src="http://internal.test:${p}/secret.png" alt="x">
<img src="/img-redirect" alt="y">
<img src="http://rebind.test:${p}/r1.png" alt="r1"><img src="http://rebind.test:${p}/r2.png" alt="r2">
<script>
document.cookie = 'tracking=1';
fetch('/api', { method: 'POST', body: 'x' }).catch(() => {});
try { new WebSocket('ws://127.0.0.1:${p}/ws'); } catch (e) {}
fetch('/after-cookie').catch(() => {});
</script>
</body></html>`;
  const page = (title: string, body: string, head = ''): Handler =>
    html(`<!doctype html><html lang="en"><head><title>${title}</title>${head}</head><body><main>${body}</main></body></html>`);
  handlers['/'] = html(home, 200, { 'set-cookie': 'session=abc; Path=/' });
  handlers['/a'] = page('A', '<h1>A</h1><button>Go</button><a href="/">Home</a>', '<style>button:focus{outline:none}</style>');
  handlers['/b'] = page('B', '<h1>B</h1><a href="/c">C</a>');
  handlers['/c'] = page('C', '<h1>C</h1>');
  for (let i = 1; i <= 6; i++) handlers[`/deep/${i}`] = page(`D${i}`, `<a href="/deep/${i + 1}">next</a>`);
  handlers['/redir-same'] = redirect('/c?via=redirect');
  handlers['/c?via=redirect'] = page('C2', '<h1>C2</h1>');
  handlers['/redir-other'] = redirect('http://10.0.0.1/admin');
  handlers['/img-redirect'] = redirect('http://169.254.169.254/latest/meta-data/');
  handlers['/private'] = page('Private', 'private');
  handlers['/json'] = (_req, res) => {
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end('{}');
  };
  handlers['/accessibility-statement'] = page('Statement', '<h1>Statement</h1>');
  handlers['/robots.txt'] = (_req, res) => {
    res.writeHead(200, { 'content-type': 'text/plain' });
    res.end('User-agent: *\nDisallow: /private\n');
  };
  handlers['/slow'] = () => undefined;
  handlers['/busy'] = page('Busy', 'busy', '<script>for (;;) {}</script>');
  handlers['/many-frames'] = page('Frames', Array.from({ length: 40 }, (_v, i) => `<iframe src="/c?f=${i}" title="f${i}"></iframe>`).join(''));
  for (let i = 1; i <= 10; i++) {
    const next = page(`S${i}`, `<a href="/slowish/${i + 1}">next</a>`);
    handlers[`/slowish/${i}`] = (req, res) => {
      setTimeout(() => {
        next(req, res);
      }, 400);
    };
  }
  handlers['/popup-opener'] = page('Opener', '<a href="/c">C</a><script>window.open("about:blank", "_blank");</script>');
  handlers['/heavy'] = page('Heavy', Array.from({ length: 8 }, (_v, i) => `<img src="/blob?${i}" alt="b${i}">`).join(''));
  for (let i = 0; i < 8; i++) {
    handlers[`/blob?${i}`] = (_req, res) => {
      setTimeout(() => {
        res.writeHead(200, { 'content-type': 'image/png' });
        res.end(Buffer.alloc(200 * 1024));
      }, 300);
    };
  }
  handlers['/ws-page'] = page('WS', `<script>try { new WebSocket('ws://127.0.0.1:${p}/ws'); } catch (e) {}</script>`);
  handlers['/sw-page'] = page('SW', '<p>sw</p>');
  handlers['/sw.js'] = (_req, res) => {
    res.writeHead(200, { 'content-type': 'text/javascript' });
    res.end('self.addEventListener("fetch", () => {});');
  };
  handlers['/huge'] = html(`<!doctype html><html lang="en"><body>${'x'.repeat(3 * 1024 * 1024)}</body></html>`);
  const png: Handler = (_req, res) => {
    res.writeHead(200, { 'content-type': 'image/png' });
    res.end();
  };
  handlers['/r1.png'] = png;
  handlers['/r2.png'] = png;
  browser = await launchBrowser();
}, 60_000);

afterAll(async () => {
  await browser.close();
  await srv.close();
});

describe('scan of a local site', () => {
  it('crawls the same origin, maps findings and blocks every unsafe request', async () => {
    rebindCalls = 0;
    srv.seen.length = 0;
    const r = await scan(opts({ limits: { maxPages: 20, maxDepth: 2 } }), browser);
    const urls = r.pages.map((p) => new URL(p.url).pathname + new URL(p.url).search);
    expect(urls).toContain('/');
    expect(urls).toContain('/a');
    expect(urls).toContain('/c');
    expect(urls).not.toContain('/file.pdf');
    expect(urls.some((u) => u.startsWith('/deep/3'))).toBe(false); // depth limit 2
    expect(r.pages.every((p) => p.url.startsWith(srv.origin))).toBe(true);

    const home = r.pages.find((p) => new URL(p.url).pathname === '/')!;
    const ids = home.violations.map((v) => v.ruleId);
    expect(ids).toContain('image-alt');
    expect(ids).toContain('button-name');
    expect(ids).toContain('html-has-lang');
    expect(ids).not.toContain('kerbcut-page-lang'); // axe already reported it
    const img = home.violations.find((v) => v.ruleId === 'image-alt')!;
    expect(img.wcag).toEqual(['1.1.1']);
    expect(img.en301549).toEqual(['9.1.1.1']);

    // SSRF: blocked sub-resources are recorded and never reached.
    const blocked = home.blockedRequests.map((b) => `${new URL(b.url).hostname} ${b.reason}`);
    expect(blocked).toContain('internal.test private');
    expect(blocked.some((b) => b.endsWith('cloud-metadata') || b.includes('169.254.169.254'))).toBe(true);
    expect(blocked).toContain('rebind.test private');
    expect(home.blockedRequests.some((b) => b.reason === 'method POST')).toBe(true);
    const seenPaths = srv.seen.map((s) => s.url);
    expect(seenPaths).not.toContain('/api');
    expect(srv.seen.some((s) => s.method === 'POST')).toBe(false);
    expect(seenPaths.filter((u) => u === '/r1.png' || u === '/r2.png')).toHaveLength(1);
    expect(srv.upgrades).toBe(0);
    // No cookies ever reach the server, although the site set some.
    expect(srv.seen.every((s) => s.headers.cookie === undefined)).toBe(true);
    expect(srv.seen.every((s) => (s.headers['user-agent'] ?? '').includes('Kerbcut/'))).toBe(true);

    // Redirects
    const moved = r.pages.find((p) => p.url.endsWith('/redir-same'))!;
    expect(moved.finalUrl).toBe(`${srv.origin}/c?via=redirect`);
    expect(r.skipped).toContainEqual({ url: `${srv.origin}/redir-other`, reason: 'other-origin', detail: 'http://10.0.0.1/admin' });
    expect(r.skipped).toContainEqual({ url: `${srv.origin}/private`, reason: 'robots' });
    expect(r.skipped.some((s) => s.url.endsWith('/json') && s.reason === 'not-html')).toBe(true);
    expect(srv.seen.map((s) => s.url)).not.toContain('/private');

    // Kerbcut checks
    const a = r.pages.find((p) => p.url.endsWith('/a'))!;
    expect(a.lang).toBe('en');
    const focus = a.needsReview.find((f) => f.ruleId === 'kerbcut-focus-visible');
    expect(focus?.heuristic).toBe(true);
    expect(focus?.en301549).toEqual(['9.2.4.7']);
    expect(r.siteChecks[0]).toMatchObject({ outcome: 'found' });
    expect(r.siteChecks[0]!.links).toContain(`${srv.origin}/accessibility-statement`);

    expect(r.summary.violations.findings).toBeGreaterThan(0);
    expect(r.tool.browser).toMatch(/^Chromium /);
  });

  it('respects maxPages and reports that it stopped early', async () => {
    const r = await scan(opts({ limits: { maxPages: 2 } }), browser);
    expect(r.pages).toHaveLength(2);
    expect(r.skipped.some((s) => s.reason === 'limit-pages')).toBe(true);
    expect(r.scan.stoppedEarly).toBe('page limit reached');
  });

  it('respects maxDepth 0', async () => {
    const r = await scan(opts({ limits: { maxDepth: 0 } }), browser);
    expect(r.pages.map((p) => p.url)).toEqual([`${srv.origin}/`]);
  });

  it('can ignore robots.txt when asked', async () => {
    const r = await scan(opts({ startUrl: `${srv.origin}/private`, respectRobotsTxt: false, limits: { maxPages: 1 } }), browser);
    expect(r.pages[0]?.url).toBe(`${srv.origin}/private`);
    expect(r.scan.respectRobotsTxt).toBe(false);
  });

  it('enforces the per-page time limit', async () => {
    const r = await scan(opts({ startUrl: `${srv.origin}/slow`, limits: { pageTimeoutMs: 1500, maxPages: 1 } }), browser);
    expect(r.pages[0]?.error).toMatch(/limit|timeout|Timeout/);
  });

  it('survives a page that never stops running script', async () => {
    const t0 = Date.now();
    const r = await scan(opts({ startUrl: `${srv.origin}/busy`, limits: { pageTimeoutMs: 2000, maxPages: 1 } }), browser);
    expect(r.pages[0]?.error).toBeDefined();
    expect(Date.now() - t0).toBeLessThan(20_000);
  });

  it('enforces the request budget per page', async () => {
    const r = await scan(opts({ startUrl: `${srv.origin}/many-frames`, limits: { maxRequestsPerPage: 10, maxPages: 1 } }), browser);
    expect(r.pages[0]?.blockedRequests.some((b) => b.reason === 'request limit')).toBe(true);
  });

  it('enforces the total time limit', async () => {
    const t0 = Date.now();
    const r = await scan(opts({ startUrl: `${srv.origin}/slowish/1`, limits: { totalTimeMs: 1500, pageTimeoutMs: 1500, maxDepth: 20 } }), browser);
    expect(Date.now() - t0).toBeLessThan(10_000);
    expect(r.pages.length).toBeLessThan(10);
    expect(r.scan.stoppedEarly).toBe('total time limit reached');
    expect(r.skipped.some((s) => s.reason === 'limit-time')).toBe(true);
  });

  it('enforces the response size limit', async () => {
    const r = await scan(opts({ startUrl: `${srv.origin}/huge`, limits: { maxResponseBytes: 1024 * 1024, maxPages: 1 } }), browser);
    expect(r.pages[0]?.error).toBeDefined();
    expect(r.pages[0]?.blockedRequests.some((b) => b.reason === 'limit: size')).toBe(true);
  });

  it('charges the page byte budget while parallel responses stream in', async () => {
    const r = await scan(opts({ startUrl: `${srv.origin}/heavy`, limits: { maxPages: 1, maxPageBytes: 600 * 1024, maxResponseBytes: 1024 * 1024, maxFocusChecks: 0 } }), browser);
    const overBudget = r.pages[0]!.blockedRequests.filter((b) => b.url.includes('/blob?') && (b.reason === 'limit: size' || b.reason === 'page size limit'));
    // 8 x 200 KiB requested at once against a 600 KiB budget: at most 3 fit.
    expect(overBudget.length).toBeGreaterThanOrEqual(5);
  });

  it('closes pop-ups a page opened before the next page is scanned', async () => {
    const open: number[] = [];
    await scan(
      opts({
        startUrl: `${srv.origin}/popup-opener`,
        limits: { maxPages: 2, maxFocusChecks: 0 },
        onProgress: (e) => {
          if (e.type === 'page-start') open.push(browser.contexts().reduce((n, c) => n + c.pages().length, 0));
        },
      }),
      browser,
    );
    expect(open).toEqual([0, 0]);
  });

  it('treats a robots.txt server error as "disallow everything"', async () => {
    const down = await startServer({ '/robots.txt': html('down', 503), '/': html('<!doctype html><html lang="en"><title>x</title></html>') });
    try {
      const r = await scan({ ...opts(), startUrl: `${down.origin}/`, allowedPorts: [down.port] }, browser);
      expect(r.pages).toEqual([]);
      expect(r.skipped).toContainEqual({ url: `${down.origin}/`, reason: 'robots' });
      expect(down.seen.map((x) => x.url)).toEqual(['/robots.txt']);
    } finally {
      await down.close();
    }
  });

  it('refuses a loopback start URL without the test-only switch', async () => {
    await expect(scan({ startUrl: `${srv.origin}/`, allowedPorts: [srv.port] }, browser)).rejects.toBeInstanceOf(SsrfError);
  });

  it('refuses invalid start URLs and limits', async () => {
    await expect(scan({ startUrl: 'file:///etc/passwd' }, browser)).rejects.toBeInstanceOf(SsrfError);
    await expect(scan(opts({ limits: { maxPages: 100_000 } }), browser)).rejects.toThrow(RangeError);
  });

  it('runs WCAG 2.2 rules and V4.1.1 clause numbers when asked', async () => {
    const r = await scan(opts({ wcag22: true, en301549Version: 'V4.1.1', limits: { maxPages: 1 } }), browser);
    expect(r.scan.axeTags).toContain('wcag22aa');
    expect(r.standards).toMatchObject({ wcag: '2.2', en301549Version: 'V4.1.1' });
  });
});

describe('browser context controls, each on its own', () => {
  // A browser without Kerbcut's Chromium switches (name resolution still on),
  // so each context-level control is shown to work by itself.
  let plain: Browser;
  beforeAll(async () => {
    plain = await chromium.launch({ headless: true, chromiumSandbox: true });
  });
  afterAll(async () => {
    await plain.close();
  });
  const routerFor = (net: PageNetwork) => ({
    policy: createSsrfPolicy({ allowedPorts: [srv.port], unsafeAllowLoopbackForTesting: true }),
    limits: DEFAULT_LIMITS,
    allowNonGet: false,
    networkFor: () => net,
  });

  it('closes WebSockets in the context', async () => {
    srv.upgrades = 0;
    const context = await createScanContext(plain, routerFor(new PageNetwork()));
    const p = await context.newPage();
    await p.goto(`${srv.origin}/ws-page`);
    await p.waitForTimeout(500);
    await context.close();
    expect(srv.upgrades).toBe(0);
  });

  it('blocks service workers in the context', async () => {
    srv.seen.length = 0;
    const context = await createScanContext(plain, routerFor(new PageNetwork()));
    const p = await context.newPage();
    await p.goto(`${srv.origin}/sw-page`);
    // Playwright's block replaces register() with a stub that registers nothing.
    const registered: unknown = await p.evaluate(async () => {
      try {
        const r: unknown = await navigator.serviceWorker.register('/sw.js');
        return r !== undefined;
      } catch {
        return false;
      }
    });
    await p.waitForTimeout(300);
    await context.close();
    expect(registered).toBe(false);
    expect(srv.seen.map((x) => x.url)).not.toContain('/sw.js');
  });
});
