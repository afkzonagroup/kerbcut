// Copyright 2026 MB AFKzona Group
// SPDX-License-Identifier: AGPL-3.0-only
import { describe, expect, it } from 'vitest';
import { classifyIp, formatIp, isLoopback, parseIp, parseIpv4, parseIpv6 } from '../src/net/ip.js';

function cls(s: string): ReturnType<typeof classifyIp> {
  const ip = parseIp(s);
  if (!ip) throw new Error(`unparsable ${s}`);
  return classifyIp(ip);
}

describe('parseIpv4', () => {
  it('parses canonical dotted decimal', () => {
    expect(parseIpv4('192.0.2.1')?.bytes).toEqual([192, 0, 2, 1]);
    expect(parseIpv4('0.0.0.0')?.bytes).toEqual([0, 0, 0, 0]);
    expect(parseIpv4('255.255.255.255')?.bytes).toEqual([255, 255, 255, 255]);
  });
  it.each(['2130706433', '0x7f.0.0.1', '0177.0.0.1', '127.1', '127.0.1', '017700000001', '127.000.000.001', '256.0.0.1', '1.2.3', '1.2.3.4.5', ' 1.2.3.4', '1.2.3.4 ', '01.2.3.4', ''])(
    'rejects non-canonical or invalid form %s',
    (s) => {
      expect(parseIpv4(s)).toBeUndefined();
    },
  );
});

describe('parseIpv6', () => {
  it('parses compressed, full and embedded IPv4 forms', () => {
    expect(formatIp(parseIpv6('::1')!)).toBe('::1');
    expect(formatIp(parseIpv6('0:0:0:0:0:0:0:1')!)).toBe('::1');
    expect(formatIp(parseIpv6('2001:DB8::1')!)).toBe('2001:db8::1');
    expect(parseIpv6('::ffff:127.0.0.1')?.bytes.slice(12)).toEqual([127, 0, 0, 1]);
    expect(formatIp(parseIpv6('1:2:3:4:5:6:7:8')!)).toBe('1:2:3:4:5:6:7:8');
    expect(formatIp(parseIpv6('1:0:0:2:0:0:0:3')!)).toBe('1:0:0:2::3');
    expect(formatIp(parseIpv6('::')!)).toBe('::');
  });
  it.each(['fe80::1%eth0', '[::1]', '1::2::3', '12345::', '1:2:3:4:5:6:7:8:9', ':::', '::ffff:256.0.0.1', 'g::1', '1:2:3:4:5:6:7::8:9', ''])('rejects %s', (s) => {
    expect(parseIpv6(s)).toBeUndefined();
  });
  it('parseIp accepts bracketed IPv6 as used in URL hosts', () => {
    expect(parseIp('[::1]')?.family).toBe(6);
  });
});

describe('classifyIp: IPv4 blocked ranges', () => {
  it.each([
    ['0.0.0.0', 'unspecified'],
    ['0.255.255.255', 'unspecified'],
    ['10.0.0.1', 'private'],
    ['10.255.255.255', 'private'],
    ['100.64.0.1', 'cgnat'],
    ['100.127.255.255', 'cgnat'],
    ['127.0.0.1', 'loopback'],
    ['127.255.255.254', 'loopback'],
    ['169.254.0.1', 'link-local'],
    ['169.254.169.254', 'cloud-metadata'],
    ['169.254.170.2', 'cloud-metadata'],
    ['100.100.100.200', 'cloud-metadata'],
    ['192.0.0.192', 'cloud-metadata'],
    ['168.63.129.16', 'cloud-metadata'],
    ['172.16.0.1', 'private'],
    ['172.31.255.255', 'private'],
    ['192.0.0.8', 'ietf-protocol-assignment'],
    ['192.0.2.10', 'documentation'],
    ['192.88.99.1', 'reserved'],
    ['192.168.1.1', 'private'],
    ['198.18.0.1', 'benchmarking'],
    ['198.19.255.255', 'benchmarking'],
    ['198.51.100.7', 'documentation'],
    ['203.0.113.9', 'documentation'],
    ['224.0.0.1', 'multicast'],
    ['239.255.255.255', 'multicast'],
    ['240.0.0.1', 'reserved'],
    ['255.255.255.255', 'broadcast'],
  ])('%s is blocked as %s', (ip, reason) => {
    expect(cls(ip)).toMatchObject({ blocked: true, reason });
  });
  it.each(['1.1.1.1', '8.8.8.8', '93.184.215.14', '100.63.255.255', '100.128.0.0', '172.15.255.255', '172.32.0.0', '192.169.0.1', '198.17.255.255', '198.20.0.0', '223.255.255.255'])(
    '%s is allowed',
    (ip) => {
      expect(cls(ip).blocked).toBe(false);
    },
  );
});

describe('classifyIp: IPv6 blocked ranges', () => {
  it.each([
    ['::', 'unspecified'],
    ['::1', 'loopback'],
    ['::ffff:127.0.0.1', 'ipv4-mapped'],
    ['::ffff:7f00:1', 'ipv4-mapped'],
    ['::ffff:169.254.169.254', 'ipv4-mapped'],
    ['::ffff:8.8.8.8', 'ipv4-mapped'],
    ['::127.0.0.1', 'ipv4-compatible'],
    ['::10.0.0.1', 'ipv4-compatible'],
    ['64:ff9b:1::1', 'translation'],
    ['100::1', 'discard-only'],
    ['2001:db8::1', 'documentation'],
    ['2001::1', 'ietf-protocol-assignment'],
    ['2001:0:4136:e378:8000:63bf:3fff:fdd2', 'ietf-protocol-assignment'],
    ['3fff::1', 'documentation'],
    ['5f00::1', 'reserved'],
    ['fc00::1', 'unique-local'],
    ['fd12:3456::1', 'unique-local'],
    ['fd00:ec2::254', 'cloud-metadata'],
    ['fe80::1', 'link-local'],
    ['febf::1', 'link-local'],
    ['fec0::1', 'site-local'],
    ['ff02::1', 'multicast'],
    ['4000::1', 'not-global-unicast'],
    ['1::1', 'not-global-unicast'],
  ])('%s is blocked as %s', (ip, reason) => {
    expect(cls(ip)).toMatchObject({ blocked: true, reason });
  });
  it('IPv4-mapped addresses report the embedded address', () => {
    expect(cls('::ffff:10.1.2.3')).toMatchObject({ blocked: true, reason: 'ipv4-mapped', embeddedIpv4: '10.1.2.3' });
  });
  it('NAT64 (64:ff9b::/96) is judged by the embedded IPv4 address', () => {
    expect(cls('64:ff9b::7f00:1')).toMatchObject({ blocked: true, reason: 'loopback', embeddedIpv4: '127.0.0.1' });
    expect(cls('64:ff9b::a9fe:a9fe')).toMatchObject({ blocked: true, reason: 'cloud-metadata' });
    expect(cls('64:ff9b::808:808')).toMatchObject({ blocked: false, embeddedIpv4: '8.8.8.8' });
  });
  it('6to4 (2002::/16) is judged by the embedded IPv4 address', () => {
    expect(cls('2002:c0a8:0101::1')).toMatchObject({ blocked: true, reason: 'private', embeddedIpv4: '192.168.1.1' });
    expect(cls('2002:0a00:0001::1')).toMatchObject({ blocked: true, reason: 'private' });
    expect(cls('2002:0808:0808::1')).toMatchObject({ blocked: false });
  });
  it.each(['2606:4700:4700::1111', '2001:4860:4860::8888', '2a00:1450:4001:80b::200e'])('%s is allowed', (ip) => {
    expect(cls(ip).blocked).toBe(false);
  });
});

describe('isLoopback', () => {
  it('matches only 127.0.0.0/8 and ::1', () => {
    expect(isLoopback(parseIp('127.0.0.1')!)).toBe(true);
    expect(isLoopback(parseIp('127.9.9.9')!)).toBe(true);
    expect(isLoopback(parseIp('::1')!)).toBe(true);
    expect(isLoopback(parseIp('::2')!)).toBe(false);
    expect(isLoopback(parseIp('::ffff:127.0.0.1')!)).toBe(false);
    expect(isLoopback(parseIp('10.0.0.1')!)).toBe(false);
  });
});
