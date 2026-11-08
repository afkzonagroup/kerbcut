// Copyright 2026 MB AFKzona Group
// SPDX-License-Identifier: AGPL-3.0-only
//
// A tiny document model rendered to Markdown and to HTML. Generators build
// documents from blocks; all text is escaped by the renderers, so no input
// can inject markup into either format.
import { htmlPage } from '../report/html-shell.js';
import { escapeHtml, escapeMarkdown, safeHref } from '../util/escape.js';

/** Inline content: plain text, a link, or text marked for the reader's attention. */
export type Inline = string | { readonly text: string; readonly href: string } | { readonly mark: string };

/** Block content. */
export type Block =
  | { readonly kind: 'heading'; readonly level: 1 | 2 | 3; readonly text: string }
  | { readonly kind: 'paragraph'; readonly content: readonly Inline[] }
  | { readonly kind: 'quote'; readonly cite: string; readonly text: string }
  | { readonly kind: 'list'; readonly items: readonly (readonly Inline[])[] }
  | { readonly kind: 'table'; readonly head: readonly string[]; readonly rows: readonly (readonly string[])[] };

/** A document. */
export interface Doc {
  readonly lang: string;
  readonly title: string;
  readonly blocks: readonly Block[];
}

function mdInline(content: readonly Inline[]): string {
  let atLineStart = true;
  return content
    .map((c) => {
      const start = atLineStart;
      if (typeof c === 'string') {
        atLineStart = c.endsWith('\n');
        return escapeMarkdown(c, { multiline: true, atLineStart: start });
      }
      atLineStart = false;
      if ('mark' in c) return `**${escapeMarkdown(c.mark, { atLineStart: false })}**`;
      const href = safeHref(c.href);
      if (href === undefined) return escapeMarkdown(c.text, { atLineStart: start });
      // Angle-bracket link destination; < > and spaces are percent-encoded by URL.
      return `[${escapeMarkdown(c.text, { atLineStart: false })}](<${new URL(c.href).href.replace(/[<>\s]/g, encodeURIComponent)}>)`;
    })
    .join('');
}

/** Renders a document as Markdown. */
export function renderMarkdown(doc: Doc): string {
  const out: string[] = [];
  for (const b of doc.blocks) {
    switch (b.kind) {
      case 'heading':
        out.push(`${'#'.repeat(b.level)} ${escapeMarkdown(b.text)}`);
        break;
      case 'paragraph':
        out.push(mdInline(b.content).replace(/\n/g, '  \n'));
        break;
      case 'quote':
        out.push(`> ${escapeMarkdown(b.cite)}: “${escapeMarkdown(b.text)}”`);
        break;
      case 'list':
        out.push(b.items.map((i) => `- ${mdInline(i).replace(/\n/g, ' ')}`).join('\n'));
        break;
      case 'table': {
        const cell = (s: string): string => escapeMarkdown(s).replace(/\n/g, '<br>');
        out.push(
          [
            `| ${b.head.map(cell).join(' | ')} |`,
            `| ${b.head.map(() => '---').join(' | ')} |`,
            ...b.rows.map((r) => `| ${r.map(cell).join(' | ')} |`),
          ].join('\n'),
        );
        break;
      }
    }
  }
  return `${out.join('\n\n')}\n`;
}

function htmlInline(content: readonly Inline[]): string {
  return content
    .map((c) => {
      if (typeof c === 'string') return escapeHtml(c).replace(/\n/g, '<br>');
      if ('mark' in c) return `<mark>${escapeHtml(c.mark)}</mark>`;
      const href = safeHref(c.href);
      return href === undefined ? escapeHtml(c.text) : `<a href="${href}" rel="noopener noreferrer">${escapeHtml(c.text)}</a>`;
    })
    .join('');
}

/** Renders the body blocks as HTML. */
export function renderHtmlBody(doc: Doc): string {
  return doc.blocks
    .map((b) => {
      switch (b.kind) {
        case 'heading':
          return `<h${b.level}>${escapeHtml(b.text)}</h${b.level}>`;
        case 'paragraph':
          return `<p>${htmlInline(b.content)}</p>`;
        case 'quote':
          return `<blockquote><p>${escapeHtml(b.cite)}: “${escapeHtml(b.text)}”</p></blockquote>`;
        case 'list':
          return `<ul>${b.items.map((i) => `<li>${htmlInline(i)}</li>`).join('')}</ul>`;
        case 'table':
          return `<div class="tablewrap"><table><thead><tr>${b.head.map((h) => `<th scope="col">${escapeHtml(h)}</th>`).join('')}</tr></thead><tbody>${b.rows
            .map((r) => `<tr>${r.map((c) => `<td>${escapeHtml(c).replace(/\n/g, '<br>')}</td>`).join('')}</tr>`)
            .join('')}</tbody></table></div>`;
      }
    })
    .join('\n');
}

/** Renders a document as a complete, self-contained HTML page. */
export function renderHtml(doc: Doc): string {
  return htmlPage({ title: doc.title, lang: doc.lang, bodyHtml: renderHtmlBody(doc) });
}
