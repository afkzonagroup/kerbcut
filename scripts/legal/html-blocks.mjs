// Copyright 2026 MB AFKzona Group
// SPDX-License-Identifier: AGPL-3.0-only
//
// Minimal, dependency-free reader for the XHTML that EUR-Lex serves for
// Official Journal acts. It turns the markup into an ordered list of text
// blocks. Each block keeps italic runs, because the Commission's model
// accessibility statement marks the text to be replaced in italics.
//
// This is a development tool. It runs on files downloaded by a maintainer
// and never on untrusted input at runtime.

const BLOCK_TAGS = new Set(['p', 'td', 'tr', 'table', 'tbody', 'div', 'h1', 'h2', 'h3', 'li']);

const ENTITY = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' };

/** @param {string} s */
export function decodeEntities(s) {
  return s.replace(/&(#x[0-9a-fA-F]+|#[0-9]+|[a-zA-Z]+);/g, (m, e) => {
    if (e.startsWith('#x')) return String.fromCodePoint(parseInt(e.slice(2), 16));
    if (e.startsWith('#')) return String.fromCodePoint(parseInt(e.slice(1), 10));
    return ENTITY[e] ?? m;
  });
}

/**
 * @typedef {{ text: string, italic: boolean }} Segment
 * @typedef {{ cls: string, segments: Segment[] }} Block
 */

/**
 * @param {string} html
 * @returns {Block[]}
 */
export function htmlToBlocks(html) {
  /** @type {Block[]} */
  const blocks = [];
  /** @type {Segment[]} */
  let current = [];
  let currentCls = '';
  /** @type {string[]} */
  const spanStack = [];
  let skipDepth = 0;
  let inScript = false;

  const flush = () => {
    const merged = mergeSegments(current);
    if (merged.some((s) => s.text.trim() !== '')) {
      blocks.push({ cls: currentCls, segments: trimSegments(merged) });
    }
    current = [];
  };

  const re = /<(\/?)([a-zA-Z0-9]+)([^>]*?)(\/?)>|<!--[\s\S]*?-->|<\?[\s\S]*?\?>|<![^>]*>|([^<]+)/g;
  let m;
  while ((m = re.exec(html)) !== null) {
    const [, closing, rawTag, attrs = '', selfClosing, text] = m;
    if (text !== undefined) {
      if (inScript || skipDepth > 0) continue;
      const italic = spanStack.includes('italic');
      current.push({ text: decodeEntities(text).replace(/\s+/g, ' '), italic });
      continue;
    }
    if (rawTag === undefined) continue;
    const tag = rawTag.toLowerCase();
    if (tag === 'script' || tag === 'style') {
      inScript = closing !== '1' && closing !== '/';
      if (closing === '/') inScript = false;
      continue;
    }
    if (BLOCK_TAGS.has(tag)) {
      flush();
      if (closing !== '/' && tag === 'p') {
        const c = /class="([^"]*)"/.exec(attrs);
        currentCls = c?.[1] ?? '';
      }
      continue;
    }
    if (tag === 'br') {
      current.push({ text: ' ', italic: false });
      continue;
    }
    if (tag === 'span') {
      if (selfClosing === '/') continue;
      if (closing === '/') {
        const popped = spanStack.pop();
        if (popped === 'skip') skipDepth--;
        continue;
      }
      const c = /class="([^"]*)"/.exec(attrs)?.[1] ?? '';
      if (/\boj-super\b/.test(c)) {
        spanStack.push('skip');
        skipDepth++;
      } else if (/\boj-italic\b/.test(c)) {
        spanStack.push('italic');
      } else {
        spanStack.push('other');
      }
      continue;
    }
    if (tag === 'a') {
      if (closing === '/') {
        if (spanStack.at(-1) === 'skip-a') {
          spanStack.pop();
          skipDepth--;
        }
        continue;
      }
      // Footnote call-outs such as "(1)" are links to "#ntr..." anchors.
      if (/href="#ntr/.test(attrs)) {
        spanStack.push('skip-a');
        skipDepth++;
      }
      continue;
    }
  }
  flush();
  return blocks;
}

/** @param {Segment[]} segs */
function mergeSegments(segs) {
  /** @type {Segment[]} */
  const out = [];
  for (const s of segs) {
    if (s.text === '') continue;
    const last = out.at(-1);
    if (last && last.italic === s.italic) {
      last.text = (last.text + s.text).replace(/ {2,}/g, ' ');
    } else {
      out.push({ text: s.text, italic: s.italic });
    }
  }
  return out;
}

/** @param {Segment[]} segs */
function trimSegments(segs) {
  const out = segs.map((s) => ({ ...s }));
  const first = out[0];
  if (first) first.text = first.text.replace(/^\s+/, '');
  const last = out.at(-1);
  if (last) last.text = last.text.replace(/\s+$/, '');
  return out.filter((s) => s.text !== '');
}

/** @param {Block} b */
export function blockText(b) {
  return b.segments.map((s) => s.text).join('');
}
