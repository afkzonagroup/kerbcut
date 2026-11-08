// Copyright 2026 MB AFKzona Group
// SPDX-License-Identifier: AGPL-3.0-only
//
// robots.txt parsing and matching per RFC 9309 (Robots Exclusion Protocol).
// Pure functions; fetching happens in the crawler through the SSRF guard.

/** One rule from a robots.txt group. */
export interface RobotsRule {
  readonly allow: boolean;
  readonly path: string;
}

/** Parsed robots.txt: groups keyed by lower-case product token. */
export interface RobotsTxt {
  readonly groups: ReadonlyMap<string, readonly RobotsRule[]>;
}

/** RFC 9309 section 2.5: parsers must handle at least 500 KiB. Larger input is cut. */
export const ROBOTS_MAX_BYTES = 512 * 1024;

/** Parses robots.txt text. Unknown lines are ignored, as RFC 9309 requires. */
export function parseRobotsTxt(text: string): RobotsTxt {
  const groups = new Map<string, RobotsRule[]>();
  let agents: string[] = [];
  let lastWasAgent = false;
  const body = text.length > ROBOTS_MAX_BYTES ? text.slice(0, ROBOTS_MAX_BYTES) : text;
  for (const rawLine of body.split(/\r\n|\r|\n/)) {
    const line = rawLine.replace(/#.*$/, '').trim();
    const colon = line.indexOf(':');
    if (colon <= 0) continue;
    const key = line.slice(0, colon).trim().toLowerCase();
    const value = line.slice(colon + 1).trim();
    if (key === 'user-agent') {
      if (!lastWasAgent) agents = [];
      const token = value.toLowerCase();
      agents.push(token);
      if (!groups.has(token)) groups.set(token, []);
      lastWasAgent = true;
      continue;
    }
    if (key === 'allow' || key === 'disallow') {
      lastWasAgent = false;
      if (agents.length === 0) continue;
      // An empty Disallow means "allow everything" and adds no rule.
      if (value === '') continue;
      for (const a of agents) groups.get(a)?.push({ allow: key === 'allow', path: value });
      continue;
    }
    lastWasAgent = false;
  }
  return { groups };
}

function encodePath(p: string): string {
  // Normalise percent-encoding so that "/a%2fb" and "/a%2Fb" compare equal,
  // and encode characters that are not safe in a path.
  return p
    .replace(/%[0-9a-fA-F]{2}/g, (m) => m.toUpperCase())
    .replace(/[^A-Za-z0-9\-._~!$&'()*+,;=:@/%?]/g, (c) =>
      Array.from(new TextEncoder().encode(c), (b) => `%${b.toString(16).toUpperCase().padStart(2, '0')}`).join(''),
    );
}

/** Does a robots.txt path pattern (with "*" and "$") match the path? */
export function patternMatches(pattern: string, path: string): boolean {
  const pat = encodePath(pattern);
  const target = encodePath(path);
  const anchored = pat.endsWith('$');
  const core = anchored ? pat.slice(0, -1) : pat;
  const pieces = core.split('*');
  // Greedy-free matching of "*"-separated literal pieces.
  let pos = 0;
  for (let i = 0; i < pieces.length; i++) {
    const piece = pieces[i] ?? '';
    if (i === 0) {
      if (!target.startsWith(piece)) return false;
      pos = piece.length;
      continue;
    }
    if (i === pieces.length - 1 && anchored) {
      return target.length - piece.length >= pos && target.endsWith(piece);
    }
    const found = target.indexOf(piece, pos);
    if (found < 0) return false;
    pos = found + piece.length;
  }
  return anchored ? pos === target.length : true;
}

/**
 * Is the URL path allowed for the product token? Uses the group for the
 * token, or the "*" group. The longest matching rule wins; on a tie, allow
 * wins (RFC 9309 section 2.2.2). /robots.txt itself is always allowed.
 */
export function isAllowedByRobots(robots: RobotsTxt, productToken: string, pathWithQuery: string): boolean {
  if (pathWithQuery === '/robots.txt') return true;
  const rules = robots.groups.get(productToken.toLowerCase()) ?? robots.groups.get('*');
  if (!rules || rules.length === 0) return true;
  let best: RobotsRule | undefined;
  let bestLen = -1;
  for (const r of rules) {
    if (!patternMatches(r.path, pathWithQuery)) continue;
    const len = encodePath(r.path).length;
    if (len > bestLen || (len === bestLen && r.allow && best?.allow === false)) {
      best = r;
      bestLen = len;
    }
  }
  return best ? best.allow : true;
}

/** Robots policy for a fetch status (RFC 9309 section 2.3.1). */
export function robotsForStatus(status: number, body: string): RobotsTxt | 'disallow-all' {
  if (status >= 200 && status < 300) return parseRobotsTxt(body);
  // 4xx: "unavailable" - the crawler may access any resource.
  if (status >= 400 && status < 500) return { groups: new Map() };
  // 5xx or network failure: "unreachable" - assume complete disallow.
  return 'disallow-all';
}
