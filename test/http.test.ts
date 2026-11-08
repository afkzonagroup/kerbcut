// Copyright 2026 MB AFKzona Group
// SPDX-License-Identifier: AGPL-3.0-only
import { gzipSync } from 'node:zlib';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { guardedGet, guardedRequest, LimitError, USER_AGENT } from '../src/net/http.js';
import { createSsrfPolicy, SsrfError, type LookupFn, type SsrfPolicy } from '../src/net/ssrf.js';
import { html, redirect, startServer, type TestServer } from './helpers/server.js';

let srv: TestServer;
let policy: SsrfPolicy;
const limits = { maxBytes: 1024 * 1024, timeoutMs: 5000 };

beforeAll(async () => {
  srv = await startServer({
    '/': html('<p>hello</p>', 200, { 'set-cookie': 'session=1', 'x-test': 'yes' }),
    '/big': (_req, res) => {
      res.writeHead(200, { 'content-type': 'text/plain' });
      res.end('x'.repeat(2 * 1024 * 1024));
    },
    '/big-declared': (_req, res) => {
      res.writeHead(200, { 'content-type': 'text/plain', 'content-length': String(10 * 1024 * 1024) });
      res.write('x');
      res.end();
    },
    '/bomb': (_req, res) => {
      res.writeHead(200, { 'content-type': 'text/plain', 'content-encoding': 'gzip' });
      res.end(gzipSync(Buffer.alloc(20 * 1024 * 1024)));
    },
    '/gzip': (_req, res) => {
      res.writeHead(200, { 'content-type': 'text/plain', 'content-encoding': 'gzip' });
      res.end(gzipSync(Buffer.from('compressed body')));
    },
    '/slow': (_req, res) => {
      res.writeHead(200, { 'content-type': 'text/plain' });
      res.write('a');
      // never ends
    },
    '/redir-local': redirect('/'),
    '/redir-private': redirect('http://10.0.0.1/'),
    '/redir-metadata': redirect('http://169.254.169.254/latest/meta-data/'),
    '/redir-decimal': redirect('http://2130706433/'),
    '/loop': redirect('/loop'),
  });
  policy = createSsrfPolicy({ allowedPorts: [srv.port], unsafeAllowLoopbackForTesting: true });
});
afterAll(async () => {
  await srv.close();
});

describe('guardedRequest', () => {
  it('fetches, drops Set-Cookie and hop-by-hop headers, and sends no cookies', async () => {
    const res = await guardedRequest(
      { url: `${srv.origin}/`, method: 'GET', headers: { cookie: 'a=b', authorization: 'Bearer x', 'proxy-authorization': 'x', referer: 'https://a.example/', accept: 'text/html' } },
      policy,
      limits,
    );
    expect(res.status).toBe(200);
    expect(res.body.toString()).toBe('<p>hello</p>');
    expect(res.headers['set-cookie']).toBeUndefined();
    expect(res.headers['content-length']).toBeUndefined();
    expect(res.headers['x-test']).toBe('yes');
    const seen = srv.seen.at(-1)!;
    expect(seen.headers.cookie).toBeUndefined();
    expect(seen.headers.authorization).toBeUndefined();
    expect(seen.headers['proxy-authorization']).toBeUndefined();
    expect(seen.headers.referer).toBeUndefined();
    expect(seen.headers.accept).toBe('text/html');
    expect(seen.headers['user-agent']).toBe(USER_AGENT);
  });

  it('refuses header values with line breaks', async () => {
    await guardedRequest({ url: `${srv.origin}/`, method: 'GET', headers: { accept: 'a\r\nx-injected: 1' } }, policy, limits);
    expect(srv.seen.at(-1)!.headers['x-injected']).toBeUndefined();
  });

  it('decodes gzip', async () => {
    const res = await guardedRequest({ url: `${srv.origin}/gzip`, method: 'GET' }, policy, limits);
    expect(res.body.toString()).toBe('compressed body');
    expect(res.headers['content-encoding']).toBeUndefined();
  });

  it('enforces the size limit while streaming', async () => {
    await expect(guardedRequest({ url: `${srv.origin}/big`, method: 'GET' }, policy, limits)).rejects.toMatchObject({ limit: 'size' });
  });

  it('charges a shared byte budget while the body streams in', async () => {
    let taken = 0;
    const budget = {
      take: (n: number): boolean => {
        if (taken + n > 64 * 1024) return false;
        taken += n;
        return true;
      },
    };
    await expect(guardedRequest({ url: `${srv.origin}/big`, method: 'GET' }, policy, { ...limits, maxBytes: 10 * 1024 * 1024, budget })).rejects.toMatchObject({ limit: 'size' });
    expect(taken).toBeLessThanOrEqual(64 * 1024);
    const ok = await guardedRequest({ url: `${srv.origin}/`, method: 'GET' }, policy, { ...limits, budget: { take: () => true } });
    expect(ok.status).toBe(200);
  });

  it('enforces the size limit from Content-Length before reading', async () => {
    await expect(guardedRequest({ url: `${srv.origin}/big-declared`, method: 'GET' }, policy, limits)).rejects.toBeInstanceOf(LimitError);
  });

  it('stops decompression bombs at the decoded size limit', async () => {
    await expect(guardedRequest({ url: `${srv.origin}/bomb`, method: 'GET' }, policy, limits)).rejects.toMatchObject({ limit: 'size' });
  });

  it('enforces the time limit', async () => {
    await expect(guardedRequest({ url: `${srv.origin}/slow`, method: 'GET' }, policy, { maxBytes: 1000, timeoutMs: 300 })).rejects.toMatchObject({
      limit: 'time',
    });
  });

  it('does not follow redirects', async () => {
    const res = await guardedRequest({ url: `${srv.origin}/redir-private`, method: 'GET' }, policy, limits);
    expect(res.status).toBe(302);
    expect(res.headers.location).toBe('http://10.0.0.1/');
  });

  it('refuses loopback without the test-only switch', async () => {
    const strict = createSsrfPolicy({ allowedPorts: [srv.port] });
    await expect(guardedRequest({ url: `${srv.origin}/`, method: 'GET' }, strict, limits)).rejects.toBeInstanceOf(SsrfError);
  });

  it('connects to the pinned address, not to a fresh DNS answer', async () => {
    let calls = 0;
    const lookup: LookupFn = () => {
      calls++;
      return Promise.resolve([{ address: '127.0.0.1', family: 4 }]);
    };
    const p = createSsrfPolicy({ allowedPorts: [srv.port], unsafeAllowLoopbackForTesting: true, lookup });
    const res = await guardedRequest({ url: `http://pinned.test:${srv.port}/`, method: 'GET' }, p, limits);
    expect(res.status).toBe(200);
    expect(calls).toBe(1);
    expect(srv.seen.at(-1)!.headers.host).toBe(`pinned.test:${srv.port}`);
  });
});

describe('guardedGet: every redirect hop is checked again', () => {
  it('follows same-site redirects', async () => {
    const res = await guardedGet(`${srv.origin}/redir-local`, policy, { ...limits, maxRedirects: 3 });
    expect(res.status).toBe(200);
  });
  it.each([
    ['/redir-private', 'port'],
    ['/redir-metadata', 'port'],
    ['/redir-decimal', 'port'],
  ])('blocks %s (%s, port 80 not allowed)', async (path, why) => {
    await expect(guardedGet(`${srv.origin}${path}`, policy, { ...limits, maxRedirects: 3 })).rejects.toMatchObject({ refusal: why });
  });
  it('blocks redirects to private, metadata and decimal-loopback addresses when port 80 is allowed', async () => {
    const p = createSsrfPolicy({ allowedPorts: [80, srv.port], unsafeAllowLoopbackForTesting: true });
    await expect(guardedGet(`${srv.origin}/redir-private`, p, { ...limits, maxRedirects: 3 })).rejects.toMatchObject({ refusal: 'private' });
    await expect(guardedGet(`${srv.origin}/redir-metadata`, p, { ...limits, maxRedirects: 3 })).rejects.toMatchObject({ refusal: 'cloud-metadata' });
    // With the loopback switch off, the decimal form of 127.0.0.1 is blocked as loopback.
    const name: LookupFn = () => Promise.resolve([{ address: '127.0.0.1', family: 4 }]);
    const strict = createSsrfPolicy({ allowedPorts: [80, srv.port], lookup: name });
    await expect(guardedGet('http://2130706433/', strict, { ...limits, maxRedirects: 3 })).rejects.toMatchObject({ refusal: 'loopback' });
  });
  it('caps redirects', async () => {
    await expect(guardedGet(`${srv.origin}/loop`, policy, { ...limits, maxRedirects: 3 })).rejects.toMatchObject({ limit: 'redirects' });
  });
  it('blocks DNS rebinding through a redirect: the next hop resolves to a private address', async () => {
    // A host name that first resolves to the test server, then to a private address.
    let n = 0;
    const lookup: LookupFn = () => {
      n++;
      return Promise.resolve([{ address: n === 1 ? '127.0.0.1' : '10.0.0.7', family: 4 }]);
    };
    const target = await startServer({ '/': redirect('/again'), '/again': html('should never be reached') });
    const p = createSsrfPolicy({ allowedPorts: [target.port], unsafeAllowLoopbackForTesting: true, lookup });
    await expect(guardedGet(`http://rebind.test:${target.port}/`, p, { ...limits, maxRedirects: 3 })).rejects.toMatchObject({ refusal: 'private' });
    expect(target.seen.map((s) => s.url)).toEqual(['/']);
    await target.close();
  });
});
