// Copyright 2026 MB AFKzona Group
// SPDX-License-Identifier: AGPL-3.0-only
//
// Runs a parsed command. I/O goes through the Io interface so tests can run
// the CLI in-process. Error messages never include stack traces.
import { ValidationError } from '../config/v.js';
import { generateAnnexV, parseAnnexVConfig } from '../generators/annex-v.js';
import { generateStatement, listStatementChoices, parseStatementConfig } from '../generators/statement.js';
import { en301549Clause, WCAG21, WCAG22_ADDED_A_AA, wcag21AaRules, mapAxeRule } from '../mapping/index.js';
import { SsrfError } from '../net/ssrf.js';
import { parseScanEvidence, type ScanEvidence } from '../report/evidence.js';
import { renderHtmlReport, renderJsonReport } from '../report/html.js';
import type { ScanReport } from '../report/schema.js';
import { scan } from '../scan/scanner.js';
import type { ScanOptions } from '../scan/options.js';
import { parseJsonText, readFileLimited, resolveOutputPath, UnsafePathError, writeFileSafe } from '../util/fs-safe.js';
import { TOOL_VERSION } from '../version.js';
import { HELP, parseCommand, UsageError, type Command } from './args.js';

/** Input/output used by the CLI. */
export interface Io {
  readonly cwd: string;
  readonly out: (s: string) => void;
  readonly err: (s: string) => void;
  /** Environment variables. Only KERBCUT_BROWSER_SANDBOX is read. */
  readonly env?: Readonly<Record<string, string | undefined>>;
  /** Scan implementation; replaceable in tests. */
  readonly scan?: ((o: ScanOptions) => Promise<ScanReport>) | undefined;
}

const CONFIG_MAX_BYTES = 1024 * 1024;
const REPORT_MAX_BYTES = 64 * 1024 * 1024;

/** Exit code when --fail-on matched. Exported for tests. */
export function failOnMatched(report: ScanReport, failOn: 'none' | 'violations' | 'serious'): boolean {
  if (failOn === 'none') return false;
  if (failOn === 'violations') return report.summary.violations.findings > 0;
  return report.summary.byImpact.serious.findings + report.summary.byImpact.critical.findings > 0;
}

async function write(io: Io, path: string, data: string, allowOutside: boolean): Promise<void> {
  const abs = await resolveOutputPath(path, { cwd: io.cwd, allowOutside });
  await writeFileSafe(abs, data);
  io.err(`wrote ${path}\n`);
}

async function readJson(io: Io, path: string, max: number, what: string): Promise<unknown> {
  return parseJsonText(await readFileLimited(path, { cwd: io.cwd, maxBytes: max }), what);
}

async function runCommand(cmd: Command, io: Io): Promise<number> {
  switch (cmd.kind) {
    case 'help':
      io.out(`${HELP}\n`);
      return 0;
    case 'version':
      io.out(`${TOOL_VERSION}\n`);
      return 0;
    case 'mapping': {
      if (cmd.json) {
        const rows = [...WCAG21.filter((c) => c.level !== 'AAA'), ...WCAG22_ADDED_A_AA].map((c) => ({
          sc: c.sc,
          title: c.title,
          level: c.level,
          wcagVersion: c.since,
          en301549: en301549Clause(c.sc, cmd.en301549Version)?.clause ?? null,
          axeRules: wcag21AaRules()
            .filter((r) => r.sc.includes(c.sc))
            .map((r) => r.id),
        }));
        io.out(`${JSON.stringify({ en301549Version: cmd.en301549Version, criteria: rows }, null, 2)}\n`);
      } else {
        for (const r of wcag21AaRules()) {
          const m = mapAxeRule(r.id, cmd.en301549Version);
          io.out(`${r.id}\tWCAG ${m?.wcag.join(',') ?? ''}\tEN 301 549 ${m?.en301549.join(',') ?? ''}\n`);
        }
      }
      return 0;
    }
    case 'statement-choices': {
      const choices = listStatementChoices(cmd.lang, cmd.status);
      for (const c of choices) io.out(`${c.key}\t${c.official}\n`);
      return 0;
    }
    case 'annex-v':
    case 'statement': {
      const config = await readJson(io, cmd.config, CONFIG_MAX_BYTES, 'config');
      let evidence: ScanEvidence | undefined;
      if (cmd.report !== undefined) evidence = parseScanEvidence(await readJson(io, cmd.report, REPORT_MAX_BYTES, 'report'));
      let md: string;
      let html: string;
      if (cmd.kind === 'annex-v') {
        const out = generateAnnexV(parseAnnexVConfig(config), evidence);
        md = out.markdown;
        html = out.html;
        for (const n of out.notes) io.err(`note: ${n}\n`);
        if (out.sources.labels.source === 'translation') {
          io.err('note: headings in this language are an unreviewed translation; the quoted legal text is official.\n');
        }
      } else {
        const out = generateStatement(parseStatementConfig(config), evidence);
        md = out.markdown;
        html = out.html;
        if (out.unresolvedChoices.length > 0) {
          io.err(`note: ${out.unresolvedChoices.length} grammatical alternative(s) from the model are marked in the output. Word them in "choices":\n`);
          for (const c of out.unresolvedChoices) io.err(`  ${c.key}: ${c.official}\n`);
        }
      }
      if (cmd.outMd !== undefined) await write(io, cmd.outMd, md, cmd.allowWriteOutsideCwd);
      if (cmd.outHtml !== undefined) await write(io, cmd.outHtml, html, cmd.allowWriteOutsideCwd);
      return 0;
    }
    case 'scan': {
      if (cmd.unsafeAllowLoopbackForTesting) {
        io.err('WARNING: --unsafe-allow-loopback-for-testing is set. Loopback addresses are reachable. Use only in tests.\n');
      }
      const sandbox = cmd.browserSandbox && io.env?.KERBCUT_BROWSER_SANDBOX !== 'off';
      if (!sandbox) {
        io.err('note: Chromium runs without its sandbox. Scan untrusted sites only inside a disposable container or VM.\n');
      }
      // Resolve output paths before the scan, so a bad path fails fast.
      const jsonPath = cmd.outJson !== undefined ? await resolveOutputPath(cmd.outJson, { cwd: io.cwd, allowOutside: cmd.allowWriteOutsideCwd }) : undefined;
      const htmlPath = cmd.outHtml !== undefined ? await resolveOutputPath(cmd.outHtml, { cwd: io.cwd, allowOutside: cmd.allowWriteOutsideCwd }) : undefined;
      const run = io.scan ?? scan;
      let report: ScanReport;
      try {
        report = await run({
          startUrl: cmd.url,
          limits: cmd.limits,
          respectRobotsTxt: cmd.respectRobotsTxt,
          wcag22: cmd.wcag22,
          en301549Version: cmd.en301549Version,
          allowedPorts: cmd.allowedPorts,
          allowNonGetSubrequests: cmd.allowPost,
          unsafeAllowLoopbackForTesting: cmd.unsafeAllowLoopbackForTesting,
          browserSandbox: sandbox,
          ...(cmd.quiet
            ? {}
            : {
                onProgress: (e) => {
                  if (e.type === 'page-start') io.err(`scanning ${e.url}\n`);
                  else if (e.type === 'page-skipped') io.err(`skipped ${e.url} (${e.reason})\n`);
                },
              }),
        });
      } catch (e) {
        if (e instanceof SsrfError) {
          io.err(`error: the start URL is not allowed: ${e.message}\n`);
          return 3;
        }
        io.err(`error: the scan could not run: ${e instanceof Error ? e.message.split('\n')[0] ?? '' : 'unknown error'}\n`);
        return 3;
      }
      if (jsonPath !== undefined) {
        await writeFileSafe(jsonPath, renderJsonReport(report));
        io.err(`wrote ${cmd.outJson ?? ''}\n`);
      }
      if (htmlPath !== undefined) {
        await writeFileSafe(htmlPath, renderHtmlReport(report));
        io.err(`wrote ${cmd.outHtml ?? ''}\n`);
      }
      const s = report.summary;
      io.out(
        `pages scanned: ${s.pagesScanned}, with errors: ${s.pagesWithErrors}, skipped: ${s.urlsSkipped}\n` +
          `violations: ${s.violations.findings} rule failures on ${s.violations.nodes} elements; needs review: ${s.needsReview.findings}\n` +
          'Automated testing finds only part of accessibility issues.\n',
      );
      return failOnMatched(report, cmd.failOn) ? 1 : 0;
    }
  }
}

/** Runs the CLI and returns the exit code. */
export async function runCli(argv: readonly string[], io: Io): Promise<number> {
  try {
    return await runCommand(parseCommand(argv), io);
  } catch (e) {
    if (e instanceof UsageError) {
      io.err(`error: ${e.message}\n\n${HELP}\n`);
      return 2;
    }
    if (e instanceof ValidationError || e instanceof UnsafePathError) {
      io.err(`error: ${e.message}\n`);
      return 2;
    }
    io.err(`error: ${e instanceof Error ? e.message.split('\n')[0] ?? '' : 'unknown error'}\n`);
    return 2;
  }
}
