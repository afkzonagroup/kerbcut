// Copyright 2026 MB AFKzona Group
// SPDX-License-Identifier: AGPL-3.0-only
//
// Command-line parsing. Pure: turns argv into a typed command or a usage error.
import { parseArgs } from 'node:util';
import type { ScanLimits } from '../scan/options.js';

/** A usage error (exit code 2). */
export class UsageError extends Error {
  override readonly name = 'UsageError';
}

/** Parsed command. */
export type Command =
  | { readonly kind: 'help' }
  | { readonly kind: 'version' }
  | {
      readonly kind: 'scan';
      readonly url: string;
      readonly limits: Partial<ScanLimits>;
      readonly respectRobotsTxt: boolean;
      readonly wcag22: boolean;
      readonly en301549Version: 'V3.2.1' | 'V4.1.1';
      readonly allowedPorts: readonly number[];
      readonly allowPost: boolean;
      readonly outJson?: string;
      readonly outHtml?: string;
      readonly failOn: 'none' | 'violations' | 'serious';
      readonly quiet: boolean;
      readonly allowWriteOutsideCwd: boolean;
      readonly unsafeAllowLoopbackForTesting: boolean;
      readonly browserSandbox: boolean;
    }
  | {
      readonly kind: 'annex-v' | 'statement';
      readonly config: string;
      readonly report?: string;
      readonly outMd?: string;
      readonly outHtml?: string;
      readonly allowWriteOutsideCwd: boolean;
    }
  | { readonly kind: 'statement-choices'; readonly lang: string; readonly status: 'full' | 'partial' | 'non' }
  | { readonly kind: 'mapping'; readonly json: boolean; readonly en301549Version: 'V3.2.1' | 'V4.1.1' };

/** Help text. */
export const HELP = `Usage:
  kerbcut scan <url> [options]
  kerbcut annex-v --config <file.json> [--report <report.json>] [--out-md <file>] [--out-html <file>]
  kerbcut statement --config <file.json> [--report <report.json>] [--out-md <file>] [--out-html <file>]
  kerbcut statement --list-choices --lang <code> [--status full|partial|non]
  kerbcut mapping [--json] [--en301549 V3.2.1|V4.1.1]
  kerbcut --help | --version

Scan options:
  --max-pages <n>          pages to scan (default 25, max 1000)
  --max-depth <n>          link depth from the start URL (default 3, max 20)
  --timeout <seconds>      time for the whole scan (default 300, max 3600)
  --page-timeout <seconds> time per page (default 30, max 120)
  --max-response-mb <n>    size of one response after decompression (default 5, max 50)
  --ignore-robots          do not read robots.txt (default: respect it)
  --wcag22                 also run axe-core's WCAG 2.2 A/AA rules
  --en301549 <version>     clause numbers from V3.2.1 (default) or V4.1.1
  --allow-port <port>      also allow this TCP port (repeatable; default 80 and 443 only)
  --allow-post             let pages send POST requests (default: GET and HEAD only)
  --out-json <file>        write the JSON report
  --out-html <file>        write the HTML report
  --fail-on <level>        exit 1 on: none (default), violations, serious
  --quiet                  no progress output
  --allow-write-outside-cwd  allow output files outside the working directory
  --no-browser-sandbox     run Chromium without its sandbox. Only inside a disposable
                           container or VM (the Docker image sets KERBCUT_BROWSER_SANDBOX=off)
  --unsafe-allow-loopback-for-testing
                           TEST ONLY: allow 127.0.0.0/8 and ::1. Never use on URLs you do not control.

Exit codes: 0 done, 1 --fail-on matched, 2 usage or configuration error, 3 scan could not run.
Automated testing finds only part of accessibility issues. Not legal advice.

Kerbcut by AFKzona Group - https://github.com/afkzonagroup/kerbcut
Copyright 2026 MB AFKzona Group. AGPL-3.0-only with an additional attribution
term (LICENSE-ADDITIONAL-TERMS.md). There is NO WARRANTY.`;

function intOpt(value: string | undefined, name: string, min: number, max: number): number | undefined {
  if (value === undefined) return undefined;
  if (!/^\d{1,9}$/.test(value)) throw new UsageError(`--${name} must be a whole number`);
  const n = Number(value);
  if (n < min || n > max) throw new UsageError(`--${name} must be between ${min} and ${max}`);
  return n;
}

function version(v: string | undefined): 'V3.2.1' | 'V4.1.1' {
  if (v === undefined || v === 'V3.2.1') return 'V3.2.1';
  if (v === 'V4.1.1') return 'V4.1.1';
  throw new UsageError('--en301549 must be V3.2.1 or V4.1.1');
}

/** Parses argv (without node and script). */
export function parseCommand(argv: readonly string[]): Command {
  if (argv.length === 0 || argv[0] === '--help' || argv[0] === '-h' || argv[0] === 'help') return { kind: 'help' };
  if (argv[0] === '--version' || argv[0] === '-v') return { kind: 'version' };
  const [cmd, ...rest] = argv;
  try {
    switch (cmd) {
      case 'scan':
        return parseScan(rest);
      case 'annex-v':
      case 'statement':
        return parseGenerator(cmd, rest);
      case 'mapping': {
        const { values } = parseArgs({ args: [...rest], options: { json: { type: 'boolean' }, en301549: { type: 'string' } }, strict: true, allowPositionals: false });
        return { kind: 'mapping', json: values.json === true, en301549Version: version(values.en301549) };
      }
      default:
        throw new UsageError(`unknown command: ${String(cmd)}`);
    }
  } catch (e) {
    if (e instanceof UsageError) throw e;
    throw new UsageError(e instanceof Error ? e.message : String(e));
  }
}

function parseScan(args: readonly string[]): Command {
  const { values, positionals } = parseArgs({
    args: [...args],
    allowPositionals: true,
    strict: true,
    options: {
      'max-pages': { type: 'string' },
      'max-depth': { type: 'string' },
      timeout: { type: 'string' },
      'page-timeout': { type: 'string' },
      'max-response-mb': { type: 'string' },
      'ignore-robots': { type: 'boolean' },
      wcag22: { type: 'boolean' },
      en301549: { type: 'string' },
      'allow-port': { type: 'string', multiple: true },
      'allow-post': { type: 'boolean' },
      'out-json': { type: 'string' },
      'out-html': { type: 'string' },
      'fail-on': { type: 'string' },
      quiet: { type: 'boolean' },
      'allow-write-outside-cwd': { type: 'boolean' },
      'unsafe-allow-loopback-for-testing': { type: 'boolean' },
      'no-browser-sandbox': { type: 'boolean' },
    },
  });
  if (positionals.length !== 1 || positionals[0] === undefined) throw new UsageError('scan needs exactly one URL');
  const limits: Record<string, number> = {};
  const maxPages = intOpt(values['max-pages'], 'max-pages', 1, 1000);
  const maxDepth = intOpt(values['max-depth'], 'max-depth', 0, 20);
  const timeout = intOpt(values.timeout, 'timeout', 1, 3600);
  const pageTimeout = intOpt(values['page-timeout'], 'page-timeout', 1, 120);
  const maxMb = intOpt(values['max-response-mb'], 'max-response-mb', 1, 50);
  if (maxPages !== undefined) limits.maxPages = maxPages;
  if (maxDepth !== undefined) limits.maxDepth = maxDepth;
  if (timeout !== undefined) limits.totalTimeMs = timeout * 1000;
  if (pageTimeout !== undefined) limits.pageTimeoutMs = pageTimeout * 1000;
  if (maxMb !== undefined) limits.maxResponseBytes = maxMb * 1024 * 1024;
  const ports = [80, 443, ...(values['allow-port'] ?? []).map((p) => intOpt(p, 'allow-port', 1, 65535) ?? 0)];
  const failOn = values['fail-on'] ?? 'none';
  if (failOn !== 'none' && failOn !== 'violations' && failOn !== 'serious') throw new UsageError('--fail-on must be none, violations or serious');
  return {
    kind: 'scan',
    url: positionals[0],
    limits,
    respectRobotsTxt: values['ignore-robots'] !== true,
    wcag22: values.wcag22 === true,
    en301549Version: version(values.en301549),
    allowedPorts: [...new Set(ports)],
    allowPost: values['allow-post'] === true,
    ...(values['out-json'] !== undefined ? { outJson: values['out-json'] } : {}),
    ...(values['out-html'] !== undefined ? { outHtml: values['out-html'] } : {}),
    failOn,
    quiet: values.quiet === true,
    allowWriteOutsideCwd: values['allow-write-outside-cwd'] === true,
    unsafeAllowLoopbackForTesting: values['unsafe-allow-loopback-for-testing'] === true,
    browserSandbox: values['no-browser-sandbox'] !== true,
  };
}

function parseGenerator(kind: 'annex-v' | 'statement', args: readonly string[]): Command {
  const { values } = parseArgs({
    args: [...args],
    allowPositionals: false,
    strict: true,
    options: {
      config: { type: 'string' },
      report: { type: 'string' },
      'out-md': { type: 'string' },
      'out-html': { type: 'string' },
      'allow-write-outside-cwd': { type: 'boolean' },
      'list-choices': { type: 'boolean' },
      lang: { type: 'string' },
      status: { type: 'string' },
    },
  });
  if (kind === 'statement' && values['list-choices'] === true) {
    const status = values.status ?? 'partial';
    if (status !== 'full' && status !== 'partial' && status !== 'non') throw new UsageError('--status must be full, partial or non');
    if (values.lang === undefined || !/^[a-z]{2}$/.test(values.lang)) throw new UsageError('--list-choices needs --lang <two-letter code>');
    return { kind: 'statement-choices', lang: values.lang, status };
  }
  if (values['list-choices'] === true || values.lang !== undefined || values.status !== undefined) {
    throw new UsageError('--list-choices, --lang and --status are only for "statement --list-choices"');
  }
  if (values.config === undefined) throw new UsageError(`${kind} needs --config <file.json>`);
  if (values['out-md'] === undefined && values['out-html'] === undefined) throw new UsageError(`${kind} needs --out-md and/or --out-html`);
  return {
    kind,
    config: values.config,
    ...(values.report !== undefined ? { report: values.report } : {}),
    ...(values['out-md'] !== undefined ? { outMd: values['out-md'] } : {}),
    ...(values['out-html'] !== undefined ? { outHtml: values['out-html'] } : {}),
    allowWriteOutsideCwd: values['allow-write-outside-cwd'] === true,
  };
}
