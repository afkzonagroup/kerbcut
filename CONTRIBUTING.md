# Contributing

Thank you for helping.

## Before you start

- Pull requests need a signed [Contributor Licence Agreement](CLA.md). You keep your copyright; the CLA lets AFKzona Group offer Kerbcut under both the AGPL and a commercial licence.
- Be kind. See the [Code of Conduct](CODE_OF_CONDUCT.md).
- Report security problems privately. See [SECURITY.md](SECURITY.md).

## Development

Node.js 22.12 or later is needed for the development tools (the package itself runs on Node.js 22 or later; Node.js 20 is end of life).

```sh
npm ci --ignore-scripts
npx playwright-core install chromium-headless-shell
npm run check   # typecheck + lint + tests with coverage
```

## Rules

- TypeScript strict mode, no `any`, no `@ts-ignore`, no `eslint-disable` without a written reason.
- Every rule, limit and security control has a test that fails if it is removed.
- No `eval`, `new Function`, dynamic import of input, `child_process`, or `innerHTML`.
- Legal text comes only from the official text on EUR-Lex, verbatim. Translations that are not official are marked `source: "translation"`.
- Write plain, short sentences in docs and messages.
- Small commits with clear messages.

## Updating data

- axe-core upgrade: `node scripts/generate-axe-mapping.mjs`, then `npm test`.
- Legal texts: `node scripts/legal/fetch-sources.mjs <dir>`, then `RETRIEVED=YYYY-MM-DD node scripts/legal/extract-eaa.mjs <dir> src/data/eaa-text.generated.ts` and `RETRIEVED=YYYY-MM-DD node scripts/legal/extract-model-statement.mjs <dir> src/data/model-statement.generated.ts`. Check new corrigenda on EUR-Lex and add them to `scripts/legal/sources.mjs`.
- Translations: native speakers are very welcome to review `src/generators/labels.ts`. Set `reviewed: true` only after a native review.
