// Copyright 2026 MB AFKzona Group
// SPDX-License-Identifier: AGPL-3.0-only
import { describe, expect, it } from 'vitest';
import { isAllowedByRobots, parseRobotsTxt, patternMatches, robotsForStatus, ROBOTS_MAX_BYTES } from '../src/net/robots.js';

describe('robots.txt (RFC 9309)', () => {
  const txt = `
# comment
User-agent: *
Disallow: /private/
Allow: /private/open
Disallow: /*.pdf$

User-agent: Kerbcut
User-agent: other
Disallow: /no-kerbcut
Allow: /

User-agent: Blocked
Disallow: /
`;
  const robots = parseRobotsTxt(txt);

  it('uses the group for the product token, case-insensitively', () => {
    expect(isAllowedByRobots(robots, 'Kerbcut', '/no-kerbcut')).toBe(false);
    expect(isAllowedByRobots(robots, 'kerbcut', '/private/x')).toBe(true);
    expect(isAllowedByRobots(robots, 'BLOCKED', '/anything')).toBe(false);
  });
  it('falls back to the * group', () => {
    expect(isAllowedByRobots(robots, 'someone', '/private/x')).toBe(false);
    expect(isAllowedByRobots(robots, 'someone', '/public')).toBe(true);
  });
  it('uses the longest match and lets allow win a tie', () => {
    expect(isAllowedByRobots(robots, 'someone', '/private/open/page')).toBe(true);
    const tie = parseRobotsTxt('User-agent: *\nDisallow: /a\nAllow: /a\n');
    expect(isAllowedByRobots(tie, 'x', '/a')).toBe(true);
  });
  it('supports * and $', () => {
    expect(isAllowedByRobots(robots, 'someone', '/docs/file.pdf')).toBe(false);
    expect(isAllowedByRobots(robots, 'someone', '/docs/file.pdf?x=1')).toBe(true);
    expect(patternMatches('/a*b*c', '/a-x-b-y-c-z')).toBe(true);
    expect(patternMatches('/a*b*c$', '/a-x-b-y-c-z')).toBe(false);
    expect(patternMatches('/a*b*c$', '/a-x-b-y-c')).toBe(true);
    expect(patternMatches('*/x', '/any/x')).toBe(true);
    expect(patternMatches('/x$', '/x')).toBe(true);
    expect(patternMatches('/x$', '/xy')).toBe(false);
  });
  it('compares percent-encoding consistently', () => {
    const r = parseRobotsTxt('User-agent: *\nDisallow: /caf%C3%A9\n');
    expect(isAllowedByRobots(r, 'x', '/café')).toBe(false);
    expect(isAllowedByRobots(r, 'x', '/caf%c3%a9')).toBe(false);
  });
  it('treats an empty Disallow as allow-all and always allows /robots.txt', () => {
    const r = parseRobotsTxt('User-agent: *\nDisallow:\n');
    expect(isAllowedByRobots(r, 'x', '/anything')).toBe(true);
    expect(isAllowedByRobots(parseRobotsTxt('User-agent: *\nDisallow: /\n'), 'x', '/robots.txt')).toBe(true);
  });
  it('ignores rules before any User-agent line and unknown lines', () => {
    const r = parseRobotsTxt('Disallow: /\nSitemap: https://x/s.xml\nnonsense\n');
    expect(isAllowedByRobots(r, 'x', '/a')).toBe(true);
  });
  it('handles status codes as RFC 9309 says', () => {
    expect(robotsForStatus(404, '')).toEqual({ groups: new Map() });
    expect(robotsForStatus(500, '')).toBe('disallow-all');
    expect(robotsForStatus(0, '')).toBe('disallow-all');
    const ok = robotsForStatus(200, 'User-agent: *\nDisallow: /x\n');
    expect(ok !== 'disallow-all' && isAllowedByRobots(ok, 'k', '/x')).toBe(false);
  });
  it('cuts input at the size limit', () => {
    const big = `User-agent: *\n${'Allow: /a\n'.repeat(ROBOTS_MAX_BYTES / 5)}Disallow: /late\n`;
    expect(isAllowedByRobots(parseRobotsTxt(big), 'x', '/late')).toBe(true);
  });
});
