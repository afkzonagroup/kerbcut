// Copyright 2026 MB AFKzona Group
// SPDX-License-Identifier: AGPL-3.0-only
//
// File access for the CLI. Paths come from the command line and are treated
// as untrusted: output files must stay inside the working directory (unless
// explicitly allowed), are never written through a symbolic link, and input
// files have a size limit.
import { constants } from 'node:fs';
import { lstat, mkdir, open, realpath, stat } from 'node:fs/promises';
import { dirname, isAbsolute, relative, resolve } from 'node:path';

/** Thrown for paths that are refused. */
export class UnsafePathError extends Error {
  override readonly name = 'UnsafePathError';
}

function inside(root: string, target: string): boolean {
  const rel = relative(root, target);
  return rel === '' || (!rel.startsWith('..') && !isAbsolute(rel));
}

/**
 * Resolves an output path. Refuses NUL bytes, paths outside the working
 * directory (unless allowOutside), and parent directories that resolve
 * (through symbolic links) outside it. Missing parent directories inside the
 * working directory are created.
 */
export async function resolveOutputPath(path: string, opts: { cwd: string; allowOutside: boolean }): Promise<string> {
  if (path.length === 0 || path.length > 4096 || path.includes('\0')) throw new UnsafePathError('invalid path');
  const abs = resolve(opts.cwd, path);
  const parent = dirname(abs);
  if (opts.allowOutside) {
    await mkdir(parent, { recursive: true });
    return abs;
  }
  const root = await realpath(opts.cwd);
  if (!inside(resolve(opts.cwd), abs)) throw new UnsafePathError(`refusing to write outside the working directory: ${path}`);
  // The nearest existing ancestor must really be inside the working directory.
  let existing = parent;
  for (;;) {
    try {
      await stat(existing);
      break;
    } catch {
      const up = dirname(existing);
      if (up === existing) throw new UnsafePathError(`invalid path: ${path}`);
      existing = up;
    }
  }
  if (!inside(root, await realpath(existing))) throw new UnsafePathError(`refusing to write outside the working directory: ${path}`);
  await mkdir(parent, { recursive: true });
  if (!inside(root, await realpath(parent))) throw new UnsafePathError(`refusing to write outside the working directory: ${path}`);
  return abs;
}

/**
 * Writes a file without following a symbolic link at the target, with
 * permissions 0644 for new files.
 */
export async function writeFileSafe(absPath: string, data: string): Promise<void> {
  try {
    const st = await lstat(absPath);
    if (st.isSymbolicLink()) throw new UnsafePathError(`refusing to write through a symbolic link: ${absPath}`);
    if (!st.isFile()) throw new UnsafePathError(`not a regular file: ${absPath}`);
  } catch (e) {
    if (e instanceof UnsafePathError) throw e;
    // Does not exist yet: fine.
  }
  // O_NOFOLLOW does not exist on Windows; the lstat() check above still applies there.
  const noFollow = (constants as Partial<typeof constants>).O_NOFOLLOW ?? 0;
  const flags = constants.O_WRONLY | constants.O_CREAT | constants.O_TRUNC | noFollow;
  const fh = await open(absPath, flags, 0o644);
  try {
    await fh.writeFile(data, 'utf8');
  } finally {
    await fh.close();
  }
}

/** Reads a regular file of at most maxBytes as UTF-8 text. */
export async function readFileLimited(path: string, opts: { cwd: string; maxBytes: number }): Promise<string> {
  if (path.length === 0 || path.length > 4096 || path.includes('\0')) throw new UnsafePathError('invalid path');
  const abs = resolve(opts.cwd, path);
  const st = await stat(abs);
  if (!st.isFile()) throw new UnsafePathError(`not a regular file: ${path}`);
  if (st.size > opts.maxBytes) throw new UnsafePathError(`file larger than ${opts.maxBytes} bytes: ${path}`);
  const fh = await open(abs, constants.O_RDONLY);
  try {
    const buf = Buffer.alloc(opts.maxBytes + 1);
    let total = 0;
    for (;;) {
      const { bytesRead } = await fh.read(buf, total, buf.length - total, null);
      if (bytesRead === 0) break;
      total += bytesRead;
      if (total > opts.maxBytes) throw new UnsafePathError(`file larger than ${opts.maxBytes} bytes: ${path}`);
    }
    return buf.subarray(0, total).toString('utf8');
  } finally {
    await fh.close();
  }
}

/** Parses JSON text; errors do not echo the content. */
export function parseJsonText(text: string, what: string): unknown {
  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw new Error(`${what} is not valid JSON`);
  }
}
