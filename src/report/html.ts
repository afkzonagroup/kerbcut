// Copyright 2026 MB AFKzona Group
// SPDX-License-Identifier: AGPL-3.0-only
//
// Self-contained HTML report. Works offline: no scripts, no external
// resources, one inline style sheet allowed by its hash. Every value from the
// report is escaped with escapeHtml(); links are only made for http(s) URLs.
import { EN301549_VERSIONS, wcagCriterion, wcagUrl, type WcagPrinciple } from '../mapping/index.js';
import { escapeHtml, safeHref } from '../util/escape.js';
import { attributionFooterHtml, htmlPage } from './html-shell.js';
import type { Counts, Finding, Impact, PageReport, ScanReport } from './schema.js';

const e = escapeHtml;

const PRINCIPLE_LABEL: Readonly<Record<WcagPrinciple, string>> = {
  perceivable: '1. Perceivable',
  operable: '2. Operable',
  understandable: '3. Understandable',
  robust: '4. Robust',
};
const IMPACTS: readonly Impact[] = ['critical', 'serious', 'moderate', 'minor'];

function link(url: string | undefined, text: string): string {
  const href = safeHref(url);
  return href === undefined ? e(text) : `<a href="${href}" rel="noopener noreferrer">${e(text)}</a>`;
}

function countsRow(label: string, c: Counts): string {
  return `<tr><th scope="row">${e(label)}</th><td class="n">${e(c.findings)}</td><td class="n">${e(c.nodes)}</td></tr>`;
}

function wcagList(f: Finding): string {
  if (f.wcag.length === 0) return 'none';
  return f.wcag
    .map((sc) => {
      const c = wcagCriterion(sc);
      return c ? link(wcagUrl(c), `${sc} ${c.title} (${c.level})`) : e(sc);
    })
    .join(', ');
}

function findingHtml(f: Finding): string {
  const impact = f.impact ? `<span class="impact-${e(f.impact)}">${e(f.impact)}</span>` : 'n/a';
  const nodes = f.nodes
    .map((n) => {
      const target = n.target.length > 0 ? `<code>${e(n.target.join(' > '))}</code>` : '';
      const html = n.html !== '' ? `<br><code>${e(n.html)}</code>` : '';
      const summary = n.summary !== undefined ? `<br>${e(n.summary)}` : '';
      return `<li>${target}${html}${summary}</li>`;
    })
    .join('');
  const more = f.nodeCount > f.nodes.length ? `<p class="meta">${e(f.nodeCount - f.nodes.length)} more element(s) not listed.</p>` : '';
  return `<div class="finding">
<p><strong>${e(f.help)}</strong></p>
<p>Rule: <code>${e(f.ruleId)}</code>${f.source === 'kerbcut' ? ' (Kerbcut check)' : ''}${f.heuristic ? ' <span class="tag">heuristic</span>' : ''} &middot; Impact: ${impact} &middot; Elements: ${e(f.nodeCount)}${f.helpUrl !== undefined ? ` &middot; ${link(f.helpUrl, 'Rule help')}` : ''}</p>
<p>WCAG: ${wcagList(f)} &middot; EN 301 549: ${f.en301549.length > 0 ? e(f.en301549.join(', ')) : 'none'}</p>
${nodes !== '' ? `<ul>${nodes}</ul>` : ''}${more}
</div>`;
}

function pageHtml(p: PageReport, index: number): string {
  const nodes = p.violations.reduce((n, f) => n + f.nodeCount, 0);
  const head = `${p.url} — ${p.violations.length} violation(s), ${nodes} element(s)`;
  const info: string[] = [];
  info.push(`<p class="meta">Final URL: <span class="url">${e(p.finalUrl)}</span>${p.status !== undefined ? ` &middot; HTTP ${e(p.status)}` : ''}${p.title !== undefined ? ` &middot; Title: ${e(p.title)}` : ''} &middot; lang: ${p.lang !== undefined ? `<code>${e(p.lang)}</code>` : 'missing'} &middot; depth ${e(p.depth)}</p>`);
  if (p.error !== undefined) info.push(`<p class="notice">Not scanned: ${e(p.error)}</p>`);
  for (const w of p.warnings ?? []) info.push(`<p class="notice">${e(w)}</p>`);
  const v = p.violations.length > 0 ? `<h4>Violations</h4>${p.violations.map(findingHtml).join('')}` : p.error === undefined ? '<p class="ok">No violations found by the automated rules.</p>' : '';
  const r = p.needsReview.length > 0 ? `<h4>Needs review</h4>${p.needsReview.map(findingHtml).join('')}` : '';
  const blocked =
    p.blockedRequests.length > 0
      ? `<h4>Requests blocked by the scanner</h4><ul>${p.blockedRequests.map((b) => `<li><span class="url">${e(b.url)}</span>: ${e(b.reason)}</li>`).join('')}</ul>`
      : '';
  return `<details id="page-${index}"><summary class="url">${e(head)}</summary>${info.join('')}${v}${r}${blocked}</details>`;
}

/** Renders the report as a complete HTML document. */
export function renderHtmlReport(report: ScanReport): string {
  const s = report.summary;
  const en = EN301549_VERSIONS[report.standards.en301549Version];
  const parts: string[] = [];
  parts.push(`<h1>Accessibility scan report</h1>
<p class="meta">Start URL: <span class="url">${e(report.scan.startUrl)}</span></p>
<p class="meta">Scanned ${e(report.scan.startedAt)} to ${e(report.scan.finishedAt)} with ${e(report.tool.name)} ${e(report.tool.version)}, axe-core ${e(report.tool.axeCoreVersion)}, ${e(report.tool.browser)}. Report format ${e(report.schemaVersion)}.</p>
<div class="notice" role="note"><p><strong>Automated testing finds only part of accessibility issues.</strong></p><p>${e(report.disclaimer)}</p></div>`);
  if (report.scan.stoppedEarly !== undefined) parts.push(`<p class="notice">The scan stopped early: ${e(report.scan.stoppedEarly)}.</p>`);

  parts.push(`<h2 id="standards">What was tested</h2>
<p>axe-core rules tagged ${e(report.scan.axeTags.join(', '))}, mapped to WCAG ${e(report.standards.wcag)} Level A and AA success criteria and to ${e(en.title)} clause 9 (web).</p>
<p>${e(report.standards.en301549Status)}</p>
<p>Robots.txt ${report.scan.respectRobotsTxt ? 'was respected' : 'was ignored'}. Limits: ${e(
    Object.entries(report.scan.limits)
      .map(([k, v]) => `${k} ${v}`)
      .join(', '),
  )}.</p>`);

  parts.push(`<h2 id="summary">Summary</h2>
<ul>
<li>Pages scanned: ${e(s.pagesScanned)}</li>
<li>Pages with errors: ${e(s.pagesWithErrors)}</li>
<li>URLs skipped: ${e(s.urlsSkipped)}</li>
<li>Violations: ${e(s.violations.findings)} rule failures on ${e(s.violations.nodes)} elements</li>
<li>Needs review: ${e(s.needsReview.findings)} results on ${e(s.needsReview.nodes)} elements</li>
</ul>
<div class="tablewrap"><table><caption>Violations by WCAG principle</caption>
<thead><tr><th scope="col">Principle</th><th scope="col" class="n">Rule failures</th><th scope="col" class="n">Elements</th></tr></thead>
<tbody>${(Object.keys(PRINCIPLE_LABEL) as WcagPrinciple[]).map((p) => countsRow(PRINCIPLE_LABEL[p], s.byPrinciple[p])).join('')}</tbody></table></div>
<div class="tablewrap"><table><caption>Violations by impact</caption>
<thead><tr><th scope="col">Impact</th><th scope="col" class="n">Rule failures</th><th scope="col" class="n">Elements</th></tr></thead>
<tbody>${IMPACTS.map((i) => countsRow(i, s.byImpact[i])).join('')}</tbody></table></div>`);

  const crit =
    s.byCriterion.length === 0
      ? '<p class="ok">No success criterion had violations found by the automated rules.</p>'
      : `<div class="tablewrap"><table><caption>Violations by success criterion</caption>
<thead><tr><th scope="col">WCAG</th><th scope="col">Title</th><th scope="col">Level</th><th scope="col">EN 301 549</th><th scope="col" class="n">Rule failures</th><th scope="col" class="n">Elements</th><th scope="col" class="n">Pages</th></tr></thead>
<tbody>${s.byCriterion
          .map((c) => {
            const crit = wcagCriterion(c.sc);
            return `<tr><td>${crit ? link(wcagUrl(crit), c.sc) : e(c.sc)}</td><td>${e(c.title)}</td><td>${e(c.level)}</td><td>${e(c.en301549 ?? 'none')}</td><td class="n">${e(c.findings)}</td><td class="n">${e(c.nodes)}</td><td class="n">${e(c.pages)}</td></tr>`;
          })
          .join('')}</tbody></table></div>`;
  parts.push(`<h3>By success criterion</h3>${crit}`);

  parts.push(`<h2 id="pages">By page</h2>
<div class="tablewrap"><table><caption>Pages</caption>
<thead><tr><th scope="col">Page</th><th scope="col" class="n">HTTP</th><th scope="col" class="n">Violations</th><th scope="col" class="n">Elements</th><th scope="col" class="n">Needs review</th></tr></thead>
<tbody>${report.pages
    .map(
      (p, i) =>
        `<tr><td class="url"><a href="#page-${i}">${e(p.url)}</a></td><td class="n">${e(p.status ?? '')}</td><td class="n">${e(p.error !== undefined ? 'not scanned' : p.violations.length)}</td><td class="n">${e(p.violations.reduce((n, f) => n + f.nodeCount, 0))}</td><td class="n">${e(p.needsReview.length)}</td></tr>`,
    )
    .join('')}</tbody></table></div>
${report.pages.map(pageHtml).join('\n')}`);

  parts.push(`<h2 id="site">Site checks</h2>${report.siteChecks
    .map(
      (c) =>
        `<h3>Link to accessibility information <span class="tag">heuristic</span></h3><p>${c.outcome === 'found' ? '<span class="ok">Found</span>' : '<span class="impact-moderate">Not found</span>'}. ${e(c.detail)}</p>${c.links.length > 0 ? `<ul>${c.links.map((l) => `<li class="url">${e(l)}</li>`).join('')}</ul>` : ''}`,
    )
    .join('')}`);

  if (report.skipped.length > 0) {
    parts.push(`<h2 id="skipped">Skipped URLs</h2><details><summary>${e(report.skipped.length)} URL(s) not scanned</summary><ul>${report.skipped
      .slice(0, 1000)
      .map((k) => `<li><span class="url">${e(k.url)}</span>: ${e(k.reason)}${k.detail !== undefined ? ` (${e(k.detail)})` : ''}</li>`)
      .join('')}</ul></details>`);
  }
  return htmlPage({
    title: `Accessibility scan report: ${report.scan.startUrl}`,
    lang: 'en',
    bodyHtml: parts.join('\n'),
    footerHtml: attributionFooterHtml(),
    skipLinkText: 'Skip to content',
  });
}

/** Serialises the report as JSON. */
export function renderJsonReport(report: ScanReport): string {
  return `${JSON.stringify(report, null, 2)}\n`;
}
