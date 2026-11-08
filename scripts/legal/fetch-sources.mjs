// Copyright 2026 MB AFKzona Group
// SPDX-License-Identifier: AGPL-3.0-only
//
// Downloads the official EUR-Lex HTML of Directive (EU) 2019/882 and of
// Implementing Decision (EU) 2018/1523 in every official language.
// Usage: node scripts/legal/fetch-sources.mjs <output-dir>
// Output: <dir>/eaa/<LANG>.html and <dir>/d1523/<LANG>.html
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { EU_LANGUAGES, SOURCES } from './sources.mjs';

const out = process.argv[2];
if (!out) {
  console.error('Usage: node scripts/legal/fetch-sources.mjs <output-dir>');
  process.exit(2);
}

for (const [dir, src] of [['eaa', SOURCES.eaa], ['d1523', SOURCES.modelStatement]]) {
  await mkdir(join(out, dir), { recursive: true });
  for (const lang of EU_LANGUAGES) {
    const res = await fetch(src.url(lang), { redirect: 'follow' });
    if (!res.ok) {
      console.warn(`${dir} ${lang}: HTTP ${res.status} (no official text in this language?)`);
      continue;
    }
    await writeFile(join(out, dir, `${lang}.html`), await res.text(), 'utf8');
    console.log(`${dir} ${lang}: saved`);
    await new Promise((r) => setTimeout(r, 1000));
  }
}
