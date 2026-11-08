// Copyright 2026 MB AFKzona Group
// SPDX-License-Identifier: AGPL-3.0-only
//
// Server-side request forgery (SSRF) guard. Every URL the scanner fetches,
// including every redirect hop and every sub-resource the page requests,
// passes through checkTarget(). The address that passed the check is the
// address the connection is made to ("pinning"), so a DNS answer cannot
// change between the check and the connection.
import { lookup as dnsLookup } from 'node:dns/promises';
import { classifyIp, formatIp, isLoopback, parseIp, type BlockReason, type IpAddress } from './ip.js';

/** One resolved address. */
export interface ResolvedAddress {
  readonly address: string;
  readonly family: 4 | 6;
}

/** DNS resolver signature. Defaults to the operating system resolver. */
export type LookupFn = (hostname: string) => Promise<readonly ResolvedAddress[]>;

/** SSRF policy. */
export interface SsrfPolicy {
  /** TCP ports that may be contacted. Default: 80 and 443. */
  readonly allowedPorts: readonly number[];
  /**
   * TEST ONLY. Allows loopback addresses (127.0.0.0/8, ::1) so integration
   * tests can scan a local test server. Every other blocked range stays
   * blocked. The CLI only sets this with --unsafe-allow-loopback-for-testing.
   */
  readonly unsafeAllowLoopbackForTesting: boolean;
  /** DNS resolver. */
  readonly lookup: LookupFn;
  /** DNS timeout in milliseconds. */
  readonly dnsTimeoutMs: number;
}

/** Why a URL was refused. */
export type SsrfRefusal =
  | 'invalid-url'
  | 'scheme'
  | 'credentials'
  | 'port'
  | 'hostname'
  | 'dns-failure'
  | 'no-address'
  | BlockReason;

/** Thrown when a URL must not be fetched. */
export class SsrfError extends Error {
  override readonly name = 'SsrfError';
  constructor(
    readonly refusal: SsrfRefusal,
    message: string,
  ) {
    super(message);
  }
}

/** A URL that passed the guard, with the address to connect to. */
export interface CheckedTarget {
  readonly url: URL;
  readonly hostname: string;
  readonly port: number;
  readonly pinned: ResolvedAddress;
}

/** Default resolver: OS resolver, all addresses, order as returned. */
export const systemLookup: LookupFn = async (hostname) => {
  const res = await dnsLookup(hostname, { all: true, order: 'verbatim' });
  return res.map((r) => ({ address: r.address, family: r.family === 6 ? 6 : 4 }));
};

/** Builds a policy with safe defaults. */
export function createSsrfPolicy(overrides: Partial<SsrfPolicy> = {}): SsrfPolicy {
  const ports = overrides.allowedPorts ?? [80, 443];
  for (const p of ports) {
    if (!Number.isInteger(p) || p < 1 || p > 65535) throw new RangeError(`invalid port ${String(p)}`);
  }
  return {
    allowedPorts: [...ports],
    unsafeAllowLoopbackForTesting: overrides.unsafeAllowLoopbackForTesting === true,
    lookup: overrides.lookup ?? systemLookup,
    dnsTimeoutMs: overrides.dnsTimeoutMs ?? 5000,
  };
}

// Host names that never point to a public web site.
const BLOCKED_HOST_SUFFIXES = ['localhost', 'local', 'internal', 'intranet', 'lan', 'home.arpa', 'localdomain', 'corp'];
const HOSTNAME_RE = /^(?=.{1,253}$)(?:[a-z0-9_](?:[a-z0-9_-]{0,61}[a-z0-9_])?\.)*[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.?$/;

function defaultPort(url: URL): number {
  if (url.port !== '') return Number(url.port);
  return url.protocol === 'https:' ? 443 : 80;
}

/**
 * Checks the parts of a URL that need no network: scheme, credentials, port
 * and host name shape. Returns the parsed URL and, for IP literals, the address.
 */
export function checkUrlSyntax(input: string | URL, policy: SsrfPolicy): { url: URL; port: number; ip?: IpAddress } {
  let url: URL;
  try {
    url = new URL(typeof input === 'string' ? input : input.href);
  } catch {
    throw new SsrfError('invalid-url', 'not a valid absolute URL');
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new SsrfError('scheme', `scheme ${url.protocol} is not allowed; only http and https`);
  }
  if (url.username !== '' || url.password !== '') {
    throw new SsrfError('credentials', 'URLs with credentials are not allowed');
  }
  const port = defaultPort(url);
  if (!policy.allowedPorts.includes(port)) {
    throw new SsrfError('port', `port ${port} is not in the allowed list`);
  }
  // The WHATWG URL parser has already normalised decimal, octal and
  // hexadecimal IPv4 forms ("2130706433", "0x7f.1", "017700000001") to
  // dotted decimal, and wraps IPv6 in brackets.
  const host = url.hostname.toLowerCase();
  const ip = parseIp(host);
  if (ip) return { url, port, ip };
  if (!HOSTNAME_RE.test(host)) throw new SsrfError('hostname', 'host name is not a valid DNS name');
  const bare = host.endsWith('.') ? host.slice(0, -1) : host;
  const labels = bare.split('.');
  const last = labels.at(-1) ?? '';
  if (/^\d+$/.test(last) || /^0x[0-9a-f]*$/.test(last)) {
    throw new SsrfError('hostname', 'numeric host names are not allowed');
  }
  if (labels.length < 2) throw new SsrfError('hostname', 'single-label host names are not allowed');
  for (const suffix of BLOCKED_HOST_SUFFIXES) {
    if (bare === suffix || bare.endsWith(`.${suffix}`)) {
      throw new SsrfError('hostname', `host names under .${suffix} are not allowed`);
    }
  }
  return { url, port };
}

function judge(ip: IpAddress, policy: SsrfPolicy): void {
  const c = classifyIp(ip);
  if (!c.blocked) return;
  if (policy.unsafeAllowLoopbackForTesting && c.reason === 'loopback' && isLoopback(ip)) return;
  throw new SsrfError(c.reason ?? 'reserved', `address ${formatIp(ip)} is not allowed (${c.reason ?? 'reserved'})`);
}

async function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  let timer: NodeJS.Timeout | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      reject(new SsrfError('dns-failure', 'DNS lookup timed out'));
    }, ms);
  });
  try {
    return await Promise.race([p, timeout]);
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Full check of a URL: syntax, then DNS. Every address the name resolves to
 * must be allowed; one blocked address refuses the URL. The first address
 * is returned for pinning.
 */
export async function checkTarget(input: string | URL, policy: SsrfPolicy): Promise<CheckedTarget> {
  const { url, port, ip } = checkUrlSyntax(input, policy);
  const hostname = url.hostname.startsWith('[') ? url.hostname.slice(1, -1) : url.hostname;
  if (ip) {
    judge(ip, policy);
    return { url, hostname, port, pinned: { address: formatIp(ip), family: ip.family } };
  }
  let answers: readonly ResolvedAddress[];
  try {
    answers = await withTimeout(policy.lookup(hostname), policy.dnsTimeoutMs);
  } catch (e) {
    if (e instanceof SsrfError) throw e;
    throw new SsrfError('dns-failure', `DNS lookup failed for ${hostname}`);
  }
  if (answers.length === 0) throw new SsrfError('no-address', `no address for ${hostname}`);
  const parsed: IpAddress[] = [];
  for (const a of answers) {
    const p = parseIp(a.address);
    if (!p) throw new SsrfError('no-address', `resolver returned an invalid address for ${hostname}`);
    judge(p, policy);
    parsed.push(p);
  }
  const first = parsed[0];
  if (!first) throw new SsrfError('no-address', `no address for ${hostname}`);
  return { url, hostname, port, pinned: { address: formatIp(first), family: first.family } };
}
