// Copyright 2026 MB AFKzona Group
// SPDX-License-Identifier: AGPL-3.0-only
//
// Strict IP address parsing and classification. Pure functions, no I/O.
// Sources for the special-purpose ranges: IANA IPv4 and IPv6 Special-Purpose
// Address Registries (RFC 6890 and updates), RFC 6598 (CGNAT), RFC 4193
// (ULA), RFC 4291 (IPv6 addressing), RFC 6052 (NAT64), RFC 8215, RFC 3056
// (6to4), RFC 9637 (3fff::/20), RFC 9602 (5f00::/16).

/** A parsed IP address as raw bytes (4 for IPv4, 16 for IPv6). */
export interface IpAddress {
  readonly family: 4 | 6;
  readonly bytes: readonly number[];
}

/** Why an address is refused. */
export type BlockReason =
  | 'unspecified'
  | 'loopback'
  | 'private'
  | 'cgnat'
  | 'link-local'
  | 'cloud-metadata'
  | 'multicast'
  | 'broadcast'
  | 'reserved'
  | 'documentation'
  | 'benchmarking'
  | 'ietf-protocol-assignment'
  | 'ipv4-mapped'
  | 'ipv4-compatible'
  | 'unique-local'
  | 'site-local'
  | 'discard-only'
  | 'translation'
  | 'not-global-unicast';

/** Result of classifying an address. */
export interface IpClassification {
  readonly blocked: boolean;
  readonly reason?: BlockReason;
  /** For IPv6 addresses that embed an IPv4 address: the embedded address. */
  readonly embeddedIpv4?: string;
}

const IPV4_RE = /^(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)\.(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)\.(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)\.(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)$/;

/**
 * Parses a canonical dotted-decimal IPv4 address. Leading zeros, octal,
 * hexadecimal, shortened ("127.1") and integer ("2130706433") forms are
 * rejected: they are not canonical and are never produced by the WHATWG URL
 * parser or by DNS resolution.
 */
export function parseIpv4(input: string): IpAddress | undefined {
  const m = IPV4_RE.exec(input);
  if (!m) return undefined;
  return { family: 4, bytes: [Number(m[1]), Number(m[2]), Number(m[3]), Number(m[4])] };
}

/**
 * Parses an IPv6 address (RFC 4291 text forms, including "::" compression
 * and a trailing dotted IPv4 part). Zone identifiers ("%eth0") and
 * surrounding brackets are rejected.
 */
export function parseIpv6(input: string): IpAddress | undefined {
  if (input.length === 0 || input.length > 45 || !/^[0-9a-fA-F:.]+$/.test(input)) return undefined;
  const parts = input.split('::');
  if (parts.length > 2) return undefined;
  const parseGroups = (s: string): number[] | undefined => {
    if (s === '') return [];
    const groups = s.split(':');
    const out: number[] = [];
    for (let i = 0; i < groups.length; i++) {
      const g = groups[i] ?? '';
      if (i === groups.length - 1 && g.includes('.')) {
        const v4 = parseIpv4(g);
        if (!v4) return undefined;
        const [a = 0, b = 0, c = 0, d = 0] = v4.bytes;
        out.push((a << 8) | b, (c << 8) | d);
        continue;
      }
      if (!/^[0-9a-fA-F]{1,4}$/.test(g)) return undefined;
      out.push(parseInt(g, 16));
    }
    return out;
  };
  const head = parseGroups(parts[0] ?? '');
  const tail = parts.length === 2 ? parseGroups(parts[1] ?? '') : [];
  if (!head || !tail) return undefined;
  let groups: number[];
  if (parts.length === 2) {
    const fill = 8 - head.length - tail.length;
    if (fill < 1) return undefined;
    groups = [...head, ...new Array<number>(fill).fill(0), ...tail];
  } else {
    groups = head;
  }
  if (groups.length !== 8) return undefined;
  const bytes: number[] = [];
  for (const g of groups) bytes.push((g >> 8) & 0xff, g & 0xff);
  return { family: 6, bytes };
}

/** Parses an IPv4 or IPv6 literal. IPv6 may be wrapped in brackets, as in URL hosts. */
export function parseIp(input: string): IpAddress | undefined {
  const s = input.startsWith('[') && input.endsWith(']') ? input.slice(1, -1) : input;
  return parseIpv4(s) ?? parseIpv6(s);
}

/** Formats an address in canonical text form (RFC 5952 for IPv6). */
export function formatIp(ip: IpAddress): string {
  if (ip.family === 4) return ip.bytes.join('.');
  const groups: number[] = [];
  for (let i = 0; i < 16; i += 2) groups.push(((ip.bytes[i] ?? 0) << 8) | (ip.bytes[i + 1] ?? 0));
  // Longest run of two or more zero groups is compressed.
  let bestStart = -1;
  let bestLen = 0;
  for (let i = 0; i < 8; ) {
    if (groups[i] !== 0) {
      i++;
      continue;
    }
    let j = i;
    while (j < 8 && groups[j] === 0) j++;
    if (j - i > bestLen && j - i >= 2) {
      bestStart = i;
      bestLen = j - i;
    }
    i = j;
  }
  const hex = groups.map((g) => g.toString(16));
  if (bestStart < 0) return hex.join(':');
  const left = hex.slice(0, bestStart).join(':');
  const right = hex.slice(bestStart + bestLen).join(':');
  return `${left}::${right}`;
}

function inPrefix(bytes: readonly number[], prefix: readonly number[], bits: number): boolean {
  let remaining = bits;
  for (let i = 0; remaining > 0; i++) {
    const take = Math.min(8, remaining);
    const mask = (0xff << (8 - take)) & 0xff;
    if (((bytes[i] ?? 0) & mask) !== ((prefix[i] ?? 0) & mask)) return false;
    remaining -= take;
  }
  return true;
}

interface Range {
  readonly prefix: readonly number[];
  readonly bits: number;
  readonly reason: BlockReason;
}

const v4 = (a: number, b: number, c: number, d: number, bits: number, reason: BlockReason): Range => ({
  prefix: [a, b, c, d],
  bits,
  reason,
});

// Order matters: the first match gives the reason.
const IPV4_BLOCKED: readonly Range[] = [
  v4(169, 254, 169, 254, 32, 'cloud-metadata'), // AWS, GCP, Azure, OpenStack instance metadata
  v4(169, 254, 170, 2, 32, 'cloud-metadata'), // AWS ECS task metadata
  v4(100, 100, 100, 200, 32, 'cloud-metadata'), // Alibaba Cloud metadata
  v4(192, 0, 0, 192, 32, 'cloud-metadata'), // Oracle Cloud metadata
  v4(168, 63, 129, 16, 32, 'cloud-metadata'), // Azure WireServer (public address, host-only service)
  v4(0, 0, 0, 0, 8, 'unspecified'),
  v4(10, 0, 0, 0, 8, 'private'),
  v4(100, 64, 0, 0, 10, 'cgnat'),
  v4(127, 0, 0, 0, 8, 'loopback'),
  v4(169, 254, 0, 0, 16, 'link-local'),
  v4(172, 16, 0, 0, 12, 'private'),
  v4(192, 0, 0, 0, 24, 'ietf-protocol-assignment'),
  v4(192, 0, 2, 0, 24, 'documentation'),
  v4(192, 88, 99, 0, 24, 'reserved'), // deprecated 6to4 relay anycast
  v4(192, 168, 0, 0, 16, 'private'),
  v4(198, 18, 0, 0, 15, 'benchmarking'),
  v4(198, 51, 100, 0, 24, 'documentation'),
  v4(203, 0, 113, 0, 24, 'documentation'),
  v4(224, 0, 0, 0, 4, 'multicast'),
  v4(255, 255, 255, 255, 32, 'broadcast'),
  v4(240, 0, 0, 0, 4, 'reserved'),
];

const v6 = (text: string, bits: number, reason: BlockReason): Range => {
  const ip = parseIpv6(text);
  if (!ip) throw new Error(`bad range ${text}`);
  return { prefix: ip.bytes, bits, reason };
};

const IPV6_BLOCKED: readonly Range[] = [
  v6('fd00:ec2::254', 128, 'cloud-metadata'), // AWS IMDS over IPv6
  v6('::', 128, 'unspecified'),
  v6('::1', 128, 'loopback'),
  v6('::ffff:0:0', 96, 'ipv4-mapped'),
  v6('::', 96, 'ipv4-compatible'),
  v6('64:ff9b:1::', 48, 'translation'), // local-use NAT64 (RFC 8215)
  v6('100::', 64, 'discard-only'),
  v6('2001:db8::', 32, 'documentation'),
  v6('2001::', 23, 'ietf-protocol-assignment'), // includes Teredo 2001::/32
  v6('3fff::', 20, 'documentation'),
  v6('5f00::', 16, 'reserved'), // SRv6 SIDs
  v6('fc00::', 7, 'unique-local'),
  v6('fe80::', 10, 'link-local'),
  v6('fec0::', 10, 'site-local'),
  v6('ff00::', 8, 'multicast'),
];

const NAT64_WKP = v6('64:ff9b::', 96, 'translation');
const SIX_TO_FOUR = v6('2002::', 16, 'translation');
const GLOBAL_UNICAST = v6('2000::', 3, 'not-global-unicast');

/**
 * Classifies an address. Anything that is not a globally routable unicast
 * address is blocked. IPv4-mapped and IPv4-compatible IPv6 addresses are
 * always blocked. NAT64 (64:ff9b::/96) and 6to4 (2002::/16) addresses are
 * judged by the IPv4 address they embed.
 */
export function classifyIp(ip: IpAddress): IpClassification {
  if (ip.family === 4) {
    for (const r of IPV4_BLOCKED) if (inPrefix(ip.bytes, r.prefix, r.bits)) return { blocked: true, reason: r.reason };
    return { blocked: false };
  }
  for (const r of IPV6_BLOCKED) {
    if (inPrefix(ip.bytes, r.prefix, r.bits)) {
      if (r.reason === 'ipv4-mapped' || r.reason === 'ipv4-compatible') {
        return { blocked: true, reason: r.reason, embeddedIpv4: ip.bytes.slice(12).join('.') };
      }
      return { blocked: true, reason: r.reason };
    }
  }
  if (inPrefix(ip.bytes, NAT64_WKP.prefix, NAT64_WKP.bits)) {
    return classifyEmbedded(ip.bytes.slice(12));
  }
  if (inPrefix(ip.bytes, SIX_TO_FOUR.prefix, SIX_TO_FOUR.bits)) {
    return classifyEmbedded(ip.bytes.slice(2, 6));
  }
  if (!inPrefix(ip.bytes, GLOBAL_UNICAST.prefix, GLOBAL_UNICAST.bits)) {
    return { blocked: true, reason: 'not-global-unicast' };
  }
  return { blocked: false };
}

function classifyEmbedded(bytes: readonly number[]): IpClassification {
  const embedded: IpAddress = { family: 4, bytes };
  const inner = classifyIp(embedded);
  const text = bytes.join('.');
  return inner.blocked
    ? { blocked: true, reason: inner.reason ?? 'translation', embeddedIpv4: text }
    : { blocked: false, embeddedIpv4: text };
}

/** True for 127.0.0.0/8 and ::1. Used only by the explicit test-only loopback switch. */
export function isLoopback(ip: IpAddress): boolean {
  if (ip.family === 4) return ip.bytes[0] === 127;
  return ip.bytes.every((b, i) => (i === 15 ? b === 1 : b === 0));
}
