// Copyright 2026 MB AFKzona Group
// SPDX-License-Identifier: AGPL-3.0-only
import type { En301549Version } from '../mapping/index.js';
import type { LookupFn } from '../net/ssrf.js';

/** Crawl and fetch limits. All are enforced; none can be switched off. */
export interface ScanLimits {
  /** Pages to scan at most. */
  readonly maxPages: number;
  /** Link depth from the start URL (start URL = 0). */
  readonly maxDepth: number;
  /** Time for the whole scan, in milliseconds. */
  readonly totalTimeMs: number;
  /** Time for one page (load + checks), in milliseconds. */
  readonly pageTimeoutMs: number;
  /** Size of one response after decompression, in bytes. */
  readonly maxResponseBytes: number;
  /** Total bytes one page may load, in bytes. */
  readonly maxPageBytes: number;
  /** Requests one page may make. */
  readonly maxRequestsPerPage: number;
  /** Redirect hops per request chain. */
  readonly maxRedirects: number;
  /** Elements stored per rule per page. */
  readonly maxNodesPerRule: number;
  /** Focus-indicator heuristic: elements checked per page. */
  readonly maxFocusChecks: number;
}

/** Defaults. */
export const DEFAULT_LIMITS: ScanLimits = {
  maxPages: 25,
  maxDepth: 3,
  totalTimeMs: 5 * 60_000,
  pageTimeoutMs: 30_000,
  maxResponseBytes: 5 * 1024 * 1024,
  maxPageBytes: 25 * 1024 * 1024,
  maxRequestsPerPage: 300,
  maxRedirects: 5,
  maxNodesPerRule: 20,
  maxFocusChecks: 30,
};

/** Upper bounds. Values above these are refused. */
export const MAX_LIMITS: ScanLimits = {
  maxPages: 1000,
  maxDepth: 20,
  totalTimeMs: 60 * 60_000,
  pageTimeoutMs: 120_000,
  maxResponseBytes: 50 * 1024 * 1024,
  maxPageBytes: 200 * 1024 * 1024,
  maxRequestsPerPage: 2000,
  maxRedirects: 10,
  maxNodesPerRule: 200,
  maxFocusChecks: 200,
};

/** Lower bounds. */
export const MIN_LIMITS: ScanLimits = {
  maxPages: 1,
  maxDepth: 0,
  totalTimeMs: 1_000,
  pageTimeoutMs: 1_000,
  maxResponseBytes: 1024,
  maxPageBytes: 1024,
  maxRequestsPerPage: 1,
  maxRedirects: 0,
  maxNodesPerRule: 1,
  maxFocusChecks: 0,
};

/** Options for scan(). */
export interface ScanOptions {
  /** Where to start. Only pages with the same origin are crawled. */
  readonly startUrl: string;
  readonly limits?: Partial<ScanLimits>;
  /** Respect robots.txt for the product token "Kerbcut" (default true). */
  readonly respectRobotsTxt?: boolean;
  /** Also run axe-core's WCAG 2.2 A/AA rules (default false). */
  readonly wcag22?: boolean;
  /** Ports that may be contacted (default 80 and 443). */
  readonly allowedPorts?: readonly number[];
  /** Let pages send POST requests for sub-resources (default false: only GET and HEAD). */
  readonly allowNonGetSubrequests?: boolean;
  /** EN 301 549 version for clause numbers (default V3.2.1). */
  readonly en301549Version?: En301549Version;
  /**
   * TEST ONLY. Allows loopback addresses so tests can scan a local server.
   * Never set this when scanning URLs you do not control.
   */
  readonly unsafeAllowLoopbackForTesting?: boolean;
  /**
   * Run Chromium with its own sandbox (default true). Set false only where
   * the sandbox cannot start and a disposable container or VM isolates the
   * scan instead. Ignored when you pass your own browser to scan().
   */
  readonly browserSandbox?: boolean;
  /** Custom DNS resolver (default: operating system). Its answers are still checked. */
  readonly lookup?: LookupFn;
  /** Progress callback. */
  readonly onProgress?: (event: ProgressEvent) => void;
}

/** Progress events. */
export type ProgressEvent =
  | { readonly type: 'page-start'; readonly url: string; readonly index: number }
  | { readonly type: 'page-done'; readonly url: string; readonly violations: number }
  | { readonly type: 'page-skipped'; readonly url: string; readonly reason: string };

/** Merges and checks limits. */
export function resolveLimits(partial: Partial<ScanLimits> = {}): ScanLimits {
  const out: Record<string, number> = { ...DEFAULT_LIMITS };
  for (const key of Object.keys(DEFAULT_LIMITS) as (keyof ScanLimits)[]) {
    const v = partial[key];
    if (v === undefined) continue;
    if (!Number.isInteger(v) || v < MIN_LIMITS[key] || v > MAX_LIMITS[key]) {
      throw new RangeError(`${key} must be an integer between ${MIN_LIMITS[key]} and ${MAX_LIMITS[key]}`);
    }
    out[key] = v;
  }
  return out as unknown as ScanLimits;
}

/** axe-core tags for the selected WCAG version. */
export function axeTagsFor(wcag22: boolean): readonly string[] {
  const tags = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'];
  return wcag22 ? [...tags, 'wcag22a', 'wcag22aa'] : tags;
}
