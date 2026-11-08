// Copyright 2026 MB AFKzona Group
// SPDX-License-Identifier: AGPL-3.0-only
//
// Public API of @afkzona/kerbcut.

export { scan } from './scan/scanner.js';
export { DEFAULT_LIMITS, MAX_LIMITS, MIN_LIMITS, resolveLimits, axeTagsFor } from './scan/options.js';
export type { ScanLimits, ScanOptions, ProgressEvent } from './scan/options.js';
export { BrowserSandboxError } from './scan/browser.js';

export { buildReport } from './report/build.js';
export { renderHtmlReport, renderJsonReport } from './report/html.js';
export { REPORT_SCHEMA_VERSION, AUTOMATED_TESTING_DISCLAIMER } from './report/schema.js';
export type { ScanReport, PageReport, Finding, NodeRef, Impact, SkippedUrl, SiteCheck, Counts, CriterionSummary } from './report/schema.js';
export { parseScanEvidence } from './report/evidence.js';
export type { ScanEvidence } from './report/evidence.js';

export {
  mapAxeRule,
  en301549Clause,
  wcagCriterion,
  principleOf,
  wcag21AaRules,
  MAPPING_SOURCES,
  DEFAULT_EN301549_VERSION,
  EN301549_VERSIONS,
  WCAG21,
  WCAG22_ADDED_A_AA,
} from './mapping/index.js';
export type { RuleMapping, En301549Version, WcagCriterion, WcagPrinciple } from './mapping/index.js';

export { generateAnnexV, parseAnnexVConfig, ANNEX_I_SERVICE_POINTS } from './generators/annex-v.js';
export type { AnnexVConfig, AnnexVOutput } from './generators/annex-v.js';
export { generateStatement, parseStatementConfig, listStatementChoices, STATEMENT_LANGUAGES } from './generators/statement.js';
export type { StatementConfig, StatementOutput, StatementChoice } from './generators/statement.js';
export { EU_LANGUAGES } from './generators/languages.js';
export type { EuLanguage } from './generators/languages.js';

export { checkTarget, createSsrfPolicy, SsrfError } from './net/ssrf.js';
export type { SsrfPolicy, LookupFn, ResolvedAddress, CheckedTarget, SsrfRefusal } from './net/ssrf.js';
export { classifyIp, parseIp } from './net/ip.js';
export type { BlockReason, IpAddress, IpClassification } from './net/ip.js';

export { ValidationError } from './config/v.js';
export { TOOL_NAME, TOOL_VERSION } from './version.js';
