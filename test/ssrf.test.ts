// Copyright 2026 MB AFKzona Group
// SPDX-License-Identifier: AGPL-3.0-only
import { describe, expect, it } from 'vitest';
import { checkTarget, checkUrlSyntax, createSsrfPolicy, SsrfError, type LookupFn, type SsrfPolicy } from '../src/net/ssrf.js';

const publicLookup: LookupFn = () => Promise.resolve([{ address: '93.184.215.14', family: 4 }]);
const policy = (o: Partial<SsrfPolicy> = {}): SsrfPolicy => createSsrfPolicy({ lookup: publicLookup, ...o });

async function refusal(url: string, p: SsrfPolicy = policy()): Promise<string> {
  try {
    await checkTarget(url, p);
  } catch (e) {
    if (e instanceof SsrfError) return e.refusal;
    throw e;
  }
  return 'allowed';
}

describe('URL syntax checks', () => {
  it.each([
    ['file:///etc/passwd', 'scheme'],
    ['ftp://example.com/', 'scheme'],
    ['gopher://example.com/', 'scheme'],
    ['javascript:alert(1)', 'scheme'],
    ['data:text/html,hi', 'scheme'],
    ['ws://example.com/', 'scheme'],
    ['http://user:pass@example.com/', 'credentials'],
    ['http://user@example.com/', 'credentials'],
    ['http://example.com:8080/', 'port'],
    ['https://example.com:22/', 'port'],
    ['http://localhost/', 'hostname'],
    ['http://foo.localhost/', 'hostname'],
    ['http://printer.local/', 'hostname'],
    ['http://metadata.google.internal/', 'hostname'],
    ['http://router.home.arpa/', 'hostname'],
    ['http://metadata/', 'hostname'],
    ['not a url', 'invalid-url'],
  ])('%s is refused (%s)', async (url, why) => {
    expect(await refusal(url)).toBe(why);
  });

  it('allows normal public URLs on 80 and 443', async () => {
    expect(await refusal('http://example.com/')).toBe('allowed');
    expect(await refusal('https://example.com/a?b=c#d')).toBe('allowed');
    expect(await refusal('https://example.com:443/')).toBe('allowed');
  });

  it('allows extra ports only when configured', async () => {
    expect(await refusal('http://example.com:8080/', policy({ allowedPorts: [80, 443, 8080] }))).toBe('allowed');
  });

  it('rejects invalid port configuration', () => {
    expect(() => createSsrfPolicy({ allowedPorts: [0] })).toThrow(RangeError);
    expect(() => createSsrfPolicy({ allowedPorts: [70000] })).toThrow(RangeError);
  });
});

describe('decimal, octal, hexadecimal and short IPv4 forms', () => {
  // The WHATWG URL parser turns all of these into 127.0.0.1 or similar;
  // the guard must then block them.
  it.each([
    ['http://2130706433/', 'loopback'],
    ['http://0x7f000001/', 'loopback'],
    ['http://0x7f.0.0.1/', 'loopback'],
    ['http://0177.0.0.1/', 'loopback'],
    ['http://017700000001/', 'loopback'],
    ['http://127.1/', 'loopback'],
    ['http://127.0.1/', 'loopback'],
    ['http://0/', 'unspecified'],
    ['http://0251.0376.0251.0376/', 'cloud-metadata'],
    ['http://2852039166/', 'cloud-metadata'],
    ['http://0xa9fea9fe/', 'cloud-metadata'],
    ['http://012.1/', 'private'],
    ['http://3232235777/', 'private'],
  ])('%s is blocked as %s', async (url, why) => {
    expect(await refusal(url)).toBe(why);
  });
});

describe('IPv6 literals', () => {
  it.each([
    ['http://[::1]/', 'loopback'],
    ['http://[::]/', 'unspecified'],
    ['http://[::ffff:127.0.0.1]/', 'ipv4-mapped'],
    ['http://[::ffff:7f00:1]/', 'ipv4-mapped'],
    ['http://[::ffff:169.254.169.254]/', 'ipv4-mapped'],
    ['http://[fd00:ec2::254]/', 'cloud-metadata'],
    ['http://[fe80::1]/', 'link-local'],
    ['http://[fc00::1]/', 'unique-local'],
    ['http://[64:ff9b::a9fe:a9fe]/', 'cloud-metadata'],
    ['http://[2002:7f00:1::]/', 'loopback'],
  ])('%s is blocked as %s', async (url, why) => {
    expect(await refusal(url)).toBe(why);
  });
  it('allows public IPv6 literals and pins them', async () => {
    const t = await checkTarget('http://[2606:4700:4700::1111]/', policy());
    expect(t.pinned).toEqual({ address: '2606:4700:4700::1111', family: 6 });
  });
});

describe('DNS answers', () => {
  const lookup = (addrs: string[]): LookupFn => () => Promise.resolve(addrs.map((address) => ({ address, family: address.includes(':') ? 6 : 4 })));
  it('blocks a name that resolves to a private address', async () => {
    expect(await refusal('http://evil.example/', policy({ lookup: lookup(['10.0.0.1']) }))).toBe('private');
  });
  it('blocks a name with one public and one private address', async () => {
    expect(await refusal('http://mixed.example/', policy({ lookup: lookup(['93.184.215.14', '127.0.0.1']) }))).toBe('loopback');
  });
  it('blocks a name that resolves to the metadata address', async () => {
    expect(await refusal('http://meta.example/', policy({ lookup: lookup(['169.254.169.254']) }))).toBe('cloud-metadata');
  });
  it('blocks a name that resolves to an IPv4-mapped IPv6 address', async () => {
    expect(await refusal('http://mapped.example/', policy({ lookup: lookup(['::ffff:10.0.0.1']) }))).toBe('ipv4-mapped');
  });
  it('blocks names without addresses and resolver garbage', async () => {
    expect(await refusal('http://none.example/', policy({ lookup: lookup([]) }))).toBe('no-address');
    expect(await refusal('http://bad.example/', policy({ lookup: lookup(['not-an-ip']) }))).toBe('no-address');
    expect(await refusal('http://bad.example/', policy({ lookup: () => Promise.reject(new Error('ENOTFOUND')) }))).toBe('dns-failure');
  });
  it('times out slow DNS', async () => {
    const slow: LookupFn = () => new Promise(() => undefined);
    expect(await refusal('http://slow.example/', policy({ lookup: slow, dnsTimeoutMs: 50 }))).toBe('dns-failure');
  });
  it('pins the first checked address', async () => {
    const t = await checkTarget('https://two.example/', policy({ lookup: lookup(['93.184.215.14', '93.184.215.15']) }));
    expect(t.pinned).toEqual({ address: '93.184.215.14', family: 4 });
    expect(t.port).toBe(443);
    expect(t.hostname).toBe('two.example');
  });
});

describe('test-only loopback switch', () => {
  it('is off by default', async () => {
    expect(createSsrfPolicy().unsafeAllowLoopbackForTesting).toBe(false);
    expect(await refusal('http://127.0.0.1/')).toBe('loopback');
  });
  it('allows loopback and nothing else when on', async () => {
    const p = policy({ unsafeAllowLoopbackForTesting: true });
    expect(await refusal('http://127.0.0.1/', p)).toBe('allowed');
    expect(await refusal('http://[::1]/', p)).toBe('allowed');
    expect(await refusal('http://10.0.0.1/', p)).toBe('private');
    expect(await refusal('http://169.254.169.254/', p)).toBe('cloud-metadata');
    expect(await refusal('http://[::ffff:127.0.0.1]/', p)).toBe('ipv4-mapped');
    expect(await refusal('http://0.0.0.0/', p)).toBe('unspecified');
    expect(await refusal('http://localhost/', p)).toBe('hostname');
  });
});

describe('checkUrlSyntax', () => {
  it('returns the parsed IP for literals', () => {
    expect(checkUrlSyntax('http://8.8.8.8/', policy()).ip?.family).toBe(4);
    expect(checkUrlSyntax('http://example.com/', policy()).ip).toBeUndefined();
  });
  it('rejects numeric-looking host names that are not IPs', () => {
    expect(() => checkUrlSyntax('http://example.123/', policy())).toThrow(SsrfError);
  });
});
