// Copyright 2026 MB AFKzona Group
// SPDX-License-Identifier: AGPL-3.0-only
//
// One guarded HTTP request. The connection goes to the address that passed
// the SSRF check (pinned), never to a fresh DNS answer. Redirects are not
// followed here: the caller sees the 3xx and re-checks the next hop.
import { request as httpRequest, type IncomingHttpHeaders, type IncomingMessage } from 'node:http';
import { request as httpsRequest, type RequestOptions } from 'node:https';
import type { LookupFunction } from 'node:net';
import { createBrotliDecompress, createGunzip, createInflate } from 'node:zlib';
import type { Transform } from 'node:stream';
import { parseIp } from './ip.js';
import { checkTarget, type CheckedTarget, type SsrfPolicy } from './ssrf.js';
import { TOOL_NAME, TOOL_URL, TOOL_VERSION } from '../version.js';

/** User-Agent sent with every request. The product token is used for robots.txt. */
export const USER_AGENT = `Mozilla/5.0 (compatible; ${TOOL_NAME}/${TOOL_VERSION}; +${TOOL_URL})`;

/** Limits for one request. */
export interface RequestLimits {
  /** Maximum decoded body size in bytes. */
  readonly maxBytes: number;
  /** Time limit for the whole request in milliseconds. */
  readonly timeoutMs: number;
  /**
   * Shared budget, charged as decoded bytes arrive. When take() returns
   * false the request fails with a size LimitError.
   */
  readonly budget?: { take(bytes: number): boolean };
}

/** A request to send. */
export interface GuardedRequest {
  readonly url: string;
  readonly method: 'GET' | 'HEAD' | 'POST';
  /** Extra request headers. Only allow-listed names are sent. */
  readonly headers?: Readonly<Record<string, string>>;
  readonly body?: Buffer;
}

/** A response received. */
export interface GuardedResponse {
  readonly url: string;
  readonly status: number;
  /** Response headers, lower-case names, hop-by-hop and cookie headers removed. */
  readonly headers: Readonly<Record<string, string>>;
  readonly body: Buffer;
  readonly target: CheckedTarget;
}

/** Thrown when a response breaks a limit. */
export class LimitError extends Error {
  override readonly name = 'LimitError';
  constructor(
    readonly limit: 'size' | 'time' | 'redirects',
    message: string,
  ) {
    super(message);
  }
}

// Request headers we forward from the browser. Everything else is dropped:
// no Cookie, no Authorization, no Proxy-*, no Referer.
const FORWARD_REQUEST_HEADERS = new Set(['accept', 'accept-language', 'content-type', 'range', 'if-none-match', 'if-modified-since']);

// Response headers we never hand to the browser.
const DROP_RESPONSE_HEADERS = new Set([
  'set-cookie',
  'set-cookie2',
  'content-encoding',
  'content-length',
  'transfer-encoding',
  'connection',
  'keep-alive',
  'proxy-authenticate',
  'proxy-connection',
  'trailer',
  'upgrade',
  'alt-svc',
]);

function cleanHeaders(h: IncomingHttpHeaders): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(h)) {
    const name = k.toLowerCase();
    if (DROP_RESPONSE_HEADERS.has(name) || v === undefined) continue;
    out[name] = Array.isArray(v) ? v.join(', ') : v;
  }
  return out;
}

function pinnedLookup(target: CheckedTarget): LookupFunction {
  return (_hostname, options, callback) => {
    const { address, family } = target.pinned;
    if (options.all === true) {
      (callback as (err: null, addresses: { address: string; family: number }[]) => void)(null, [{ address, family }]);
    } else {
      callback(null, address, family);
    }
  };
}

function decoder(encoding: string | undefined): Transform | undefined {
  switch ((encoding ?? '').trim().toLowerCase()) {
    case '':
    case 'identity':
      return undefined;
    case 'gzip':
    case 'x-gzip':
      return createGunzip();
    case 'deflate':
      return createInflate();
    case 'br':
      return createBrotliDecompress();
    default:
      throw new Error(`unsupported content-encoding ${encoding ?? ''}`);
  }
}

/**
 * Sends one request after an SSRF check. The decoded body is capped at
 * limits.maxBytes (this also stops decompression bombs). No cookies or
 * credentials are ever sent.
 */
export async function guardedRequest(req: GuardedRequest, policy: SsrfPolicy, limits: RequestLimits): Promise<GuardedResponse> {
  const target = await checkTarget(req.url, policy);
  const isHttps = target.url.protocol === 'https:';
  const headers: Record<string, string> = {
    'user-agent': USER_AGENT,
    'accept-encoding': 'gzip, deflate, br',
  };
  for (const [k, v] of Object.entries(req.headers ?? {})) {
    const name = k.toLowerCase();
    if (FORWARD_REQUEST_HEADERS.has(name) && v.length <= 1024 && !/[\r\n]/.test(v)) headers[name] = v;
  }
  if (req.body) headers['content-length'] = String(req.body.length);

  return await new Promise<GuardedResponse>((resolve, reject) => {
    let settled = false;
    let decoding: Transform | undefined;
    const fail = (e: Error): void => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      r.destroy();
      decoding?.destroy();
      reject(e);
    };
    const options: RequestOptions = {
      method: req.method,
      host: target.hostname,
      port: target.port,
      path: `${target.url.pathname}${target.url.search}`,
      headers,
      lookup: pinnedLookup(target),
      agent: false,
      timeout: limits.timeoutMs,
    };
    // TLS: SNI and certificate check use the host name, never the pinned IP.
    if (isHttps && parseIp(target.hostname) === undefined) options.servername = target.hostname;
    const onResponse = (res: IncomingMessage): void => {
      const declared = Number(res.headers['content-length']);
      if (Number.isFinite(declared) && declared > limits.maxBytes && !res.headers['content-encoding']) {
        fail(new LimitError('size', `response larger than ${limits.maxBytes} bytes`));
        return;
      }
      let stream: NodeJS.ReadableStream = res;
      try {
        const d = req.method === 'HEAD' ? undefined : decoder(res.headers['content-encoding']);
        if (d) {
          decoding = d;
          d.on('error', (e) => {
            fail(e);
          });
          stream = res.pipe(d);
        }
      } catch (e) {
        fail(e instanceof Error ? e : new Error(String(e)));
        return;
      }
      const chunks: Buffer[] = [];
      let size = 0;
      stream.on('data', (chunk: Buffer) => {
        if (settled) return;
        size += chunk.length;
        if (size > limits.maxBytes || (limits.budget !== undefined && !limits.budget.take(chunk.length))) {
          fail(new LimitError('size', `response larger than ${limits.maxBytes} bytes`));
          return;
        }
        chunks.push(chunk);
      });
      stream.on('end', () => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        resolve({
          url: target.url.href,
          status: res.statusCode ?? 0,
          headers: cleanHeaders(res.headers),
          body: Buffer.concat(chunks),
          target,
        });
      });
      stream.on('error', (e: Error) => {
        fail(e);
      });
      res.on('error', (e) => {
        fail(e);
      });
    };
    const r = isHttps ? httpsRequest(options, onResponse) : httpRequest(options, onResponse);
    const timer = setTimeout(() => {
      fail(new LimitError('time', `request took longer than ${limits.timeoutMs} ms`));
    }, limits.timeoutMs);
    r.on('timeout', () => {
      fail(new LimitError('time', `request took longer than ${limits.timeoutMs} ms`));
    });
    r.on('error', (e) => {
      fail(e);
    });
    if (req.body) r.end(req.body);
    else r.end();
  });
}

/** True for redirect status codes that carry a Location header. */
export function isRedirect(status: number): boolean {
  return status === 301 || status === 302 || status === 303 || status === 307 || status === 308;
}

/**
 * GET with redirects followed by hand. Every hop is checked by the SSRF
 * guard again before it is contacted.
 */
export async function guardedGet(
  url: string,
  policy: SsrfPolicy,
  limits: RequestLimits & { readonly maxRedirects: number },
): Promise<GuardedResponse> {
  let current = url;
  for (let hop = 0; ; hop++) {
    const res = await guardedRequest({ url: current, method: 'GET' }, policy, limits);
    if (!isRedirect(res.status)) return res;
    const location = res.headers.location;
    if (location === undefined || location === '') return res;
    if (hop >= limits.maxRedirects) throw new LimitError('redirects', `more than ${limits.maxRedirects} redirects`);
    current = new URL(location, current).href;
  }
}
