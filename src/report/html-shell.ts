// Copyright 2026 MB AFKzona Group
// SPDX-License-Identifier: AGPL-3.0-only
//
// Shared HTML page shell for reports and generated documents: a single
// self-contained file with one inline style sheet allowed by a hash in the
// Content Security Policy, no scripts, no external resources.
import { createHash } from 'node:crypto';
import { escapeHtml } from '../util/escape.js';
import { ATTRIBUTION_TEXT, TOOL_URL, TOOL_VERSION } from '../version.js';

/** Base style sheet. A constant: never built from input. */
export const BASE_CSS = `
:root{color-scheme:light dark;--bg:#ffffff;--fg:#1b1d21;--muted:#545a64;--line:#d5d9e0;--panel:#f4f6f9;--accent:#0b57d0;--bad:#a8071a;--warn:#7a4b00;--ok:#1d6b35;--focus:#0b57d0}
@media (prefers-color-scheme:dark){:root{--bg:#121417;--fg:#e8eaed;--muted:#aab1bc;--line:#3a3f47;--panel:#1c2026;--accent:#8ab4f8;--bad:#ff8a8a;--warn:#f5c26b;--ok:#81c995;--focus:#8ab4f8}}
*{box-sizing:border-box}
html{font-size:100%}
body{margin:0;background:var(--bg);color:var(--fg);font:1rem/1.55 system-ui,-apple-system,"Segoe UI",Roboto,"Helvetica Neue",Arial,sans-serif}
main{max-width:72rem;margin:0 auto;padding:1.5rem 1rem 3rem}
a{color:var(--accent)}
a:focus-visible,summary:focus-visible{outline:3px solid var(--focus);outline-offset:2px;border-radius:2px}
.skip{position:absolute;left:-9999px}
.skip:focus{left:1rem;top:1rem;background:var(--bg);padding:.5rem 1rem;z-index:1}
h1{font-size:1.75rem;line-height:1.25;margin:0 0 .5rem}
h2{font-size:1.35rem;margin:2.25rem 0 .75rem;padding-top:.5rem;border-top:1px solid var(--line)}
h3{font-size:1.1rem;margin:1.5rem 0 .5rem}
p,ul,ol{margin:.5rem 0}
.meta{color:var(--muted);margin:0}
.notice{border-left:4px solid var(--warn);background:var(--panel);padding:.75rem 1rem;margin:1rem 0}
.tablewrap{overflow-x:auto;margin:.5rem 0}
table{border-collapse:collapse;width:100%;font-size:.95rem}
caption{text-align:left;font-weight:600;padding:.25rem 0}
th,td{border-bottom:1px solid var(--line);padding:.4rem .5rem;text-align:left;vertical-align:top}
th{background:var(--panel)}
td.n,th.n{text-align:right;font-variant-numeric:tabular-nums}
code{font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;font-size:.85rem;overflow-wrap:anywhere}
.url{overflow-wrap:anywhere}
details{border:1px solid var(--line);border-radius:6px;margin:.5rem 0;padding:.25rem .75rem}
details[open]{padding-bottom:.75rem}
summary{cursor:pointer;font-weight:600;padding:.35rem 0}
.finding{border-top:1px solid var(--line);padding:.5rem 0}
.impact-critical,.impact-serious{color:var(--bad);font-weight:600}
.impact-moderate{color:var(--warn);font-weight:600}
.ok{color:var(--ok);font-weight:600}
.tag{display:inline-block;border:1px solid var(--line);border-radius:4px;padding:0 .35rem;font-size:.85rem;margin-right:.25rem}
blockquote{margin:.5rem 0;padding:.25rem 1rem;border-left:4px solid var(--line);color:var(--muted)}
mark{background:#fff3b0;color:#1b1d21;padding:0 .15rem}
footer{margin-top:3rem;padding-top:1rem;border-top:1px solid var(--line);color:var(--muted);font-size:.9rem}
@media print{details{border:0}details>summary{list-style:none}a{color:inherit}}
`;

/** Footer with the attribution required by LICENSE-ADDITIONAL-TERMS.md (AGPL-3.0 section 7(b)). */
export function attributionFooterHtml(): string {
  return `<footer>
<p><a href="${escapeHtml(TOOL_URL)}" rel="noopener noreferrer">${escapeHtml(ATTRIBUTION_TEXT)}</a> &middot; version ${escapeHtml(TOOL_VERSION)} &middot; Not legal advice.</p>
</footer>`;
}

/**
 * Wraps body HTML into a complete document. title, lang and skipLinkText
 * are escaped here; bodyHtml and footerHtml must already be safe HTML.
 */
export function htmlPage(opts: { title: string; lang: string; bodyHtml: string; footerHtml?: string; skipLinkText?: string }): string {
  const hash = createHash('sha256').update(BASE_CSS, 'utf8').digest('base64');
  const csp = `default-src 'none'; style-src 'sha256-${hash}'; img-src 'none'; base-uri 'none'; form-action 'none'`;
  const skip = opts.skipLinkText === undefined ? '' : `<a class="skip" href="#main">${escapeHtml(opts.skipLinkText)}</a>\n`;
  return `<!doctype html>
<html lang="${escapeHtml(opts.lang)}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta http-equiv="Content-Security-Policy" content="${escapeHtml(csp)}">
<meta name="referrer" content="no-referrer">
<meta name="generator" content="${escapeHtml(`Kerbcut ${TOOL_VERSION}`)}">
<title>${escapeHtml(opts.title)}</title>
<style>${BASE_CSS}</style>
</head>
<body>
${skip}<main id="main">
${opts.bodyHtml}
${opts.footerHtml ?? ''}
</main>
</body>
</html>
`;
}
