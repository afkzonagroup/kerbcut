// Copyright 2026 MB AFKzona Group
// SPDX-License-Identifier: AGPL-3.0-only
//
// URL handling for the crawler. Pure functions.

// File types that are not HTML pages. They are not opened as pages.
const NON_PAGE_EXTENSIONS = new Set([
  'pdf', 'doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx', 'odt', 'ods', 'odp', 'rtf', 'txt', 'csv',
  'zip', 'gz', 'tgz', 'rar', '7z', 'tar', 'dmg', 'exe', 'msi', 'apk', 'iso',
  'jpg', 'jpeg', 'png', 'gif', 'webp', 'avif', 'svg', 'ico', 'bmp', 'tif', 'tiff',
  'mp3', 'mp4', 'm4a', 'wav', 'ogg', 'webm', 'mov', 'avi', 'mkv',
  'css', 'js', 'mjs', 'json', 'xml', 'rss', 'atom', 'woff', 'woff2', 'ttf', 'otf', 'eot',
]);

/**
 * Normalises a URL for de-duplication: drops the fragment, lower-cases
 * scheme and host (the URL parser does this) and removes a default port.
 * Returns undefined for URLs that are not http(s) or are too long.
 */
export function normalizeUrl(input: string, base?: string): string | undefined {
  if (input.length > 2048) return undefined;
  let u: URL;
  try {
    u = base === undefined ? new URL(input) : new URL(input, base);
  } catch {
    return undefined;
  }
  if (u.protocol !== 'http:' && u.protocol !== 'https:') return undefined;
  if (u.username !== '' || u.password !== '') return undefined;
  u.hash = '';
  const href = u.href;
  return href.length > 2048 ? undefined : href;
}

/** Same scheme, host and port. */
export function sameOrigin(a: string, b: string): boolean {
  try {
    return new URL(a).origin === new URL(b).origin;
  } catch {
    return false;
  }
}

/** True when the path ends in a file extension that is not a web page. */
export function looksLikeFile(url: string): boolean {
  let path: string;
  try {
    path = new URL(url).pathname;
  } catch {
    return true;
  }
  const last = path.split('/').pop() ?? '';
  const dot = last.lastIndexOf('.');
  if (dot < 0) return false;
  return NON_PAGE_EXTENSIONS.has(last.slice(dot + 1).toLowerCase());
}

/** Path plus query, as robots.txt rules see it. */
export function robotsPath(url: string): string {
  const u = new URL(url);
  return `${u.pathname}${u.search}`;
}
