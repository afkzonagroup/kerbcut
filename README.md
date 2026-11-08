# Kerbcut

Kerbcut scans websites for accessibility problems, maps every result to WCAG 2.1 and EN 301 549, and writes the accessibility documents EU law asks for.

It is a CLI, a TypeScript library, a GitHub Action, a Docker image, a GitLab CI template and a Playwright test helper.

**Automated testing finds only part of accessibility issues.** A clean scan does not mean a site is accessible or that a service meets the law. You still need manual testing, ideally with disabled people and users of assistive technologies. This project is not legal advice and does not make anyone compliant.

## Contents

- [Why it exists](#why-it-exists)
- [Quick start](#quick-start)
- [CLI](#cli)
- [Library](#library)
- [GitHub Action](#github-action)
- [Docker](#docker)
- [GitLab CI](#gitlab-ci)
- [Playwright test helper](#playwright-test-helper)
- [Annex V service information](#annex-v-service-information)
- [Public sector accessibility statement](#public-sector-accessibility-statement)
- [Configuration reference](#configuration-reference)
- [How it maps to the law](#how-it-maps-to-the-law)
- [EN 301 549 version status](#en-301-549-version-status)
- [Limitations](#limitations)
- [Dependencies](#dependencies)
- [Security](#security)
- [Licence and Enterprise](#licence-and-enterprise)
- [Contributing](#contributing)
- [Disclaimer](#disclaimer)

## Why it exists

The European Accessibility Act, [Directive (EU) 2019/882](https://eur-lex.europa.eu/legal-content/EN/TXT/HTML/?uri=CELEX:32019L0882), applies from 28 June 2025 ([Article 31(2)](https://eur-lex.europa.eu/legal-content/EN/TXT/HTML/?uri=CELEX:32019L0882#art_31)). It covers e-commerce services and other services provided to consumers ([Article 2(2)](https://eur-lex.europa.eu/legal-content/EN/TXT/HTML/?uri=CELEX:32019L0882#art_2)).

Service providers must:

- make websites and mobile services perceivable, operable, understandable and robust ([Article 4(3)](https://eur-lex.europa.eu/legal-content/EN/TXT/HTML/?uri=CELEX:32019L0882#art_4), [Annex I](https://eur-lex.europa.eu/legal-content/EN/TXT/HTML/?uri=CELEX:32019L0882#anx_I) Section III point (c));
- for e-commerce, make identification, security and payment functions accessible (Annex I Section IV point (g));
- prepare information on how the service meets the requirements, following [Annex V](https://eur-lex.europa.eu/legal-content/EN/TXT/HTML/?uri=CELEX:32019L0882#anx_V), and make it public ([Article 13(2)](https://eur-lex.europa.eu/legal-content/EN/TXT/HTML/?uri=CELEX:32019L0882#art_13));
- keep procedures so the service stays in conformity ([Article 13(3)](https://eur-lex.europa.eu/legal-content/EN/TXT/HTML/?uri=CELEX:32019L0882#art_13)).

Public sector bodies have a separate law: [Directive (EU) 2016/2102](https://eur-lex.europa.eu/legal-content/EN/TXT/HTML/?uri=CELEX:32016L2102). It requires an accessibility statement that follows the model in [Commission Implementing Decision (EU) 2018/1523](https://eur-lex.europa.eu/legal-content/EN/TXT/HTML/?uri=CELEX:32018D1523). Kerbcut keeps the two regimes apart: the Annex V generator is for the EAA, the statement generator is for the public sector.

## Quick start

You need Node.js 22 or later.

```sh
npm install @afkzona/kerbcut
npx playwright-core install chromium-headless-shell
npx kerbcut scan https://www.example.com/ --max-pages 10 --out-html report.html --out-json report.json
```

Open `report.html` in a browser. It works offline.

Chromium runs with its own sandbox. If it cannot start the sandbox (for example on Ubuntu 23.10 or later, which restricts unprivileged user namespaces, or inside a container), Kerbcut stops and says so. Allow user namespaces, or scan inside a disposable container or VM with `--no-browser-sandbox`.

## CLI

```text
kerbcut scan <url> [options]
kerbcut annex-v --config <file.json> [--report <report.json>] [--out-md <file>] [--out-html <file>]
kerbcut statement --config <file.json> [--report <report.json>] [--out-md <file>] [--out-html <file>]
kerbcut statement --list-choices --lang <code> [--status full|partial|non]
kerbcut mapping [--json] [--en301549 V3.2.1|V4.1.1]
```

Scan options:

| Option | Default | Meaning |
|---|---|---|
| `--max-pages <n>` | 25 | Pages to scan, 1 to 1000 |
| `--max-depth <n>` | 3 | Link depth from the start URL, 0 to 20 |
| `--timeout <s>` | 300 | Time for the whole scan, up to 3600 |
| `--page-timeout <s>` | 30 | Time per page, up to 120 |
| `--max-response-mb <n>` | 5 | Size of one response after decompression, up to 50 |
| `--ignore-robots` | off | Do not read robots.txt |
| `--wcag22` | off | Also run axe-core's WCAG 2.2 A/AA rules |
| `--en301549 <v>` | V3.2.1 | Clause numbers from V3.2.1 or V4.1.1 |
| `--allow-port <port>` | 80, 443 | Allow another TCP port (repeatable) |
| `--allow-post` | off | Let pages send POST requests |
| `--out-json <file>` | none | JSON report |
| `--out-html <file>` | none | HTML report |
| `--fail-on <level>` | none | Exit 1 on `violations` or `serious` |
| `--quiet` | off | No progress output |
| `--allow-write-outside-cwd` | off | Allow output files outside the working directory |
| `--no-browser-sandbox` | off | Run Chromium without its sandbox. Only inside a disposable container or VM. The environment variable `KERBCUT_BROWSER_SANDBOX=off` does the same (the Docker image sets it). |
| `--unsafe-allow-loopback-for-testing` | off | Test only. Allows 127.0.0.0/8 and ::1. Never use it on URLs you do not control. |

Exit codes: 0 done, 1 `--fail-on` matched, 2 usage or configuration error, 3 the scan could not run.

## Library

<!-- example: examples/scan-site.ts -->
```ts
import { writeFile } from 'node:fs/promises';
import { renderHtmlReport, renderJsonReport, scan, type ScanOptions } from '@afkzona/kerbcut';

// Scan up to 10 pages of a site and write both reports.
export async function scanSite(startUrl: string, outDir: string, extra: Partial<ScanOptions> = {}) {
  const report = await scan({ startUrl, limits: { maxPages: 10, maxDepth: 2 }, ...extra });
  await writeFile(`${outDir}/report.json`, renderJsonReport(report));
  await writeFile(`${outDir}/report.html`, renderHtmlReport(report));
  for (const c of report.summary.byCriterion) {
    console.log(`WCAG ${c.sc} / EN 301 549 ${c.en301549 ?? '-'}: ${c.nodes} elements on ${c.pages} pages`);
  }
  return report.summary.violations;
}
```

Main exports: `scan`, `renderHtmlReport`, `renderJsonReport`, `generateAnnexV`, `parseAnnexVConfig`, `generateStatement`, `parseStatementConfig`, `listStatementChoices`, `mapAxeRule`, `en301549Clause`, `wcagCriterion`, `checkTarget`, `createSsrfPolicy`. All are documented with TSDoc in the type definitions.

The JSON report format is versioned (`schemaVersion`, currently 1.0.0) and described in [schema/report.schema.json](schema/report.schema.json). Minor versions only add optional fields.

## GitHub Action

```yaml
name: Accessibility
on:
  workflow_dispatch:
permissions:
  contents: read
jobs:
  scan:
    runs-on: ubuntu-latest
    steps:
      - uses: afkzonagroup/kerbcut@v0.1.1 # pin to a commit SHA in real use
        with:
          url: https://www.example.com/
          max-pages: '25'
          fail-on: violations
```

Inputs: `url` (required), `max-pages`, `max-depth`, `timeout`, `fail-on`, `respect-robots`, `wcag22`, `report-dir`, `upload-artifact`, `browser-sandbox` (default `true`; on GitHub-hosted Ubuntu runners the action allows unprivileged user namespaces for the job so the sandbox can start; on self-hosted runners it stops with an error instead of changing the machine). Outputs: `violations`, `report-json`. The reports are uploaded as the `kerbcut-report` artifact. The action installs Node.js 22 with `actions/setup-node`, which also sets the Node.js version for later steps in the same job. Inputs reach the shell only as environment variables and separate arguments.

## Docker

The image runs as an unprivileged user and contains Playwright's headless Chromium.

```sh
docker build -t kerbcut .
docker run --rm --cap-drop=ALL --security-opt no-new-privileges --user "$(id -u):$(id -g)" \
  -v "$PWD:/work" kerbcut scan https://www.example.com/ --out-html report.html
```

Reports are written to `/work`, the mounted directory. The image is not published yet; build it from this repository.

Docker's default seccomp profile does not allow the user namespaces that Chromium's sandbox needs, so the image sets `KERBCUT_BROWSER_SANDBOX=off` and the container is the isolation boundary. Keep `--cap-drop=ALL` and `--security-opt no-new-privileges`. To use Chromium's sandbox as well, run with a seccomp profile that allows user namespaces and `-e KERBCUT_BROWSER_SANDBOX=on`.

## GitLab CI

```yaml
include:
  - remote: 'https://raw.githubusercontent.com/afkzonagroup/kerbcut/v0.1.1/ci/gitlab/kerbcut.gitlab-ci.yml'

accessibility:
  extends: .kerbcut
  variables:
    KERBCUT_URL: "https://www.example.com/"
```

Variables: `KERBCUT_URL`, `KERBCUT_MAX_PAGES`, `KERBCUT_MAX_DEPTH`, `KERBCUT_TIMEOUT`, `KERBCUT_FAIL_ON`, `KERBCUT_REPORT_DIR`, `KERBCUT_IMAGE`. The template is in [ci/gitlab/kerbcut.gitlab-ci.yml](ci/gitlab/kerbcut.gitlab-ci.yml). Until the image is published, push your own build and set `KERBCUT_IMAGE`.

## Playwright test helper

Use it in an existing Playwright test suite. It checks the page your test opened; it does not navigate or fetch anything.

```ts
import { expect as base, test } from '@playwright/test';
import { kerbcutMatchers } from '@afkzona/kerbcut/playwright';

const expect = base.extend(kerbcutMatchers);

test('checkout has no detectable accessibility violations', async ({ page }) => {
  await page.goto('/checkout');
  await expect(page).toHaveNoEaaViolations({ ignoreRules: [], minImpact: 'serious' });
});
```

`checkPage(page, options)` returns the findings if you want to handle them yourself. Options: `wcag22`, `en301549Version`, `ignoreRules`, `minImpact`, `focusHeuristic`, `maxNodesPerRule`.

## Annex V service information

Annex V says what the information must contain. Kerbcut structures your text along Annex V, quotes each legal requirement verbatim from the official text in your language, and adds the article references. You write the content; Kerbcut does not judge it.

<!-- example: examples/annex-v.ts -->
```ts
import { generateAnnexV, parseAnnexVConfig } from '@afkzona/kerbcut';

// Service information under Article 13(2) and Annex V of Directive (EU) 2019/882.
// parseAnnexVConfig() validates untrusted input, for example a JSON file.
export function annexVExample() {
  const config = parseAnnexVConfig({
    language: 'en',
    updatedOn: '2026-11-08',
    provider: { name: 'Example Shop UAB' },
    service: {
      name: 'Example Shop',
      url: 'https://shop.example/',
      category: 'e-commerce',
      description: 'An online shop for household goods.',
      operation: 'Customers search, add products to a basket and pay by card.',
    },
    requirements: [{ point: 'III.c', status: 'partially-met', explanation: 'Known issues are listed on this page.' }],
    conformityProcess: 'Every release is checked with automated and manual tests.',
    contact: { email: 'access@shop.example' },
  });
  const out = generateAnnexV(config);
  return out.markdown; // also out.html
}
```

All 24 official EU languages are supported. The quoted legal text is official. The headings around it ("Service provider", "Status" and so on) are not legal text: English is the original, the other 23 languages are translations made for this project and need review by native speakers (see [Translations](#translations-that-need-review)).

Annex V asks for the information to be included in the general terms and conditions or an equivalent document. Where you publish it is your decision.

Annex I points supported: Section III (all points) and Section IV point (g) (e-commerce). Section IV points (a) to (f) (electronic communications, audiovisual media access, passenger transport, consumer banking, e-books) are not quoted yet. For those service categories the generator prints a note, and you must describe how the service meets those points yourself.

Annex V point 2 refers to harmonised standards whose references are published in the Official Journal. No harmonised standard is cited under Directive (EU) 2019/882 yet (see [EN 301 549 version status](#en-301-549-version-status)). If you list EN 301 549, it is a voluntary reference and gives no presumption of conformity.

## Public sector accessibility statement

For public sector bodies under Directive (EU) 2016/2102 only. The generator uses the model statement of Implementing Decision (EU) 2018/1523, copied verbatim from EUR-Lex in the 23 languages in which it is published there. There is no Irish version on EUR-Lex, so Irish is not offered.

How the model is used:

- Text that is not in italics in the model is kept word for word.
- Bracketed instructions (name, scope, standard, dates, lists) are replaced by your values.
- Bracketed grammar choices such as `[This] [These] [website(s)] [is] [are]` cannot be chosen correctly by a program in 23 languages. They stay as in the model and are marked, unless you word them in `choices`. `kerbcut statement --list-choices --lang de` lists them.
- Endnotes are dropped, as the model instructs.
- With a scan report, the failed success criteria are added to the non-compliance list. Status "full" is refused when the scan found violations.

<!-- example: examples/statement.ts -->
```ts
import { generateStatement, listStatementChoices, parseStatementConfig } from '@afkzona/kerbcut';

// Public sector accessibility statement from the model in
// Commission Implementing Decision (EU) 2018/1523 (Directive (EU) 2016/2102).
export function statementExample() {
  // The model has grammatical alternatives such as "[This] [These]".
  // listStatementChoices() shows them; word them in "choices".
  console.log(listStatementChoices('en', 'partial'));
  const config = parseStatementConfig({
    language: 'en',
    bodyName: 'Example City Council',
    legislation: 'the national act transposing Directive (EU) 2016/2102',
    scope: 'the website https://city.example/',
    standard: 'EN 301 549 V3.2.1 (2021-03)',
    status: 'partial',
    nonCompliances: ['Some images have no text alternative.'],
    preparedOn: '2026-11-08',
    method: 'Self-assessment.',
    feedback: 'Write to us.',
    contact: 'accessibility@city.example',
    enforcement: 'You can complain to the ombudsman.',
    enforcementContact: 'ombudsman.example',
    choices: { 'intro.1': 'website', 'status.1': 'This website is', 'status.2': 'the non-compliances' },
  });
  const out = generateStatement(config);
  return { markdown: out.markdown, unresolved: out.unresolvedChoices };
}
```

Languages with official model text: Bulgarian, Spanish, Czech, Danish, German, Estonian, Greek, English, French, Croatian, Italian, Latvian, Lithuanian, Hungarian, Maltese, Dutch, Polish, Portuguese, Romanian, Slovak, Slovenian, Finnish, Swedish.

## Configuration reference

### Annex V config (`kerbcut annex-v --config`)

| Field | Required | Notes |
|---|---|---|
| `language` | yes | One of the 24 EU language codes (`en`, `de`, `lt`, ...) |
| `updatedOn` | yes | `YYYY-MM-DD` |
| `provider` | yes | `{ name, address?, website? }` |
| `service` | yes | `{ name, url?, category, description, operation }`. `description` is Annex V 1(a), `operation` is 1(b). `category`: `e-commerce`, `consumer-banking`, `electronic-communications`, `audiovisual-media-access`, `passenger-transport`, `e-books`, `other` |
| `requirements` | yes | Annex V 1(c). List of `{ point, status, explanation }`. `point`: `III.a`, `III.b`, `III.b.i` to `III.b.vii`, `III.c`, `III.d`, `IV.g.i` to `IV.g.iii` (e-commerce only). Section IV points (a) to (f) are not supported yet. `status`: `met`, `partially-met`, `not-met`, `not-applicable` |
| `standards` | no | Annex V point 2. `[{ reference, scope? }]` |
| `conformityProcess` | yes | Annex V point 3 |
| `disproportionateBurden` | no | Article 14. `[{ scope, assessedOn, nextAssessmentBy? }]` |
| `fundamentalAlteration` | no | Article 14. `[{ scope, assessedOn }]` |
| `contentNotCovered` | no | Article 2(4). `[{ ground: 'a'..'e', description }]` |
| `microenterprise` | no | Quotes Article 4(5). Whether you qualify (Article 3(23)) is your assessment. |
| `contact` | yes | `{ email?, phone?, url?, postal? }`, at least one |
| `authority` | no | `{ name, url? }` |

### Statement config (`kerbcut statement --config`)

| Field | Required | Notes |
|---|---|---|
| `language` | yes | One of the 23 languages above |
| `bodyName`, `legislation`, `scope`, `standard` | yes | Values for the model's placeholders. `standard` is the "xxx" of the model. |
| `legislationShort` | no | Used in "non-compliance with the [national legislation]" |
| `status` | yes | `full`, `partial` or `non` (model options (a), (b), (c)) |
| `nonCompliances`, `disproportionateBurden`, `outOfScope` | no | Lists |
| `alternatives` | no | Accessible alternatives |
| `preparedOn`, `method` | yes | Article 3 of Implementing Decision (EU) 2018/1523 |
| `lastReviewedOn` | no | `YYYY-MM-DD` |
| `feedback`, `contact`, `enforcement`, `enforcementContact` | yes | Text |
| `feedbackUrl`, `enforcementUrl` | no | http(s) URLs |
| `choices` | no | Wording for the grammar choices, keys from `--list-choices` |
| `optional` | no | Paragraphs for Section 2 (optional content) of the model |
| `includeScanFindings` | no | Default true when `--report` is given |

Unknown fields are refused, so typos are reported. All text has length limits.

## How it maps to the law

| Legal provision | What it says (short) | What Kerbcut does | Not covered |
|---|---|---|---|
| [Directive (EU) 2019/882 Art. 2(2)(f), Art. 3(30)](https://eur-lex.europa.eu/legal-content/EN/TXT/HTML/?uri=CELEX:32019L0882#art_2) | E-commerce services are in scope | Nothing; scope is your assessment | Scope decisions |
| [Art. 4(3)](https://eur-lex.europa.eu/legal-content/EN/TXT/HTML/?uri=CELEX:32019L0882#art_4), Annex I Section III(c) | Websites perceivable, operable, understandable, robust | Automated WCAG 2.1 A/AA checks with axe-core, mapped to EN 301 549 clause 9 | Most criteria need manual checks; mobile apps are not scanned |
| Annex I Section IV(g) | Accessible identification, security and payment in e-commerce | Scans those pages if they are reachable without login | Pages behind login, payment provider pages on other origins |
| [Art. 13(2)](https://eur-lex.europa.eu/legal-content/EN/TXT/HTML/?uri=CELEX:32019L0882#art_13), [Annex V](https://eur-lex.europa.eu/legal-content/EN/TXT/HTML/?uri=CELEX:32019L0882#anx_V) | Information on how the service meets the requirements | Annex V generator, legal text quoted verbatim in 24 languages | The content itself; written and oral formats |
| Art. 13(3) | Procedures to stay in conformity | Annex V point 3 field; scans can run in CI | Your internal process |
| [Art. 14](https://eur-lex.europa.eu/legal-content/EN/TXT/HTML/?uri=CELEX:32019L0882#art_14), Annex VI | Fundamental alteration, disproportionate burden | Records your assessment and dates | The assessment |
| Art. 4(5), Art. 3(23) | Microenterprises providing services are exempt | Quotes Art. 4(5) when you say you are one | Deciding if you qualify |
| Art. 2(4) | Content not covered (old media, office files, maps, third-party content, archives) | Lists your exclusions with the official wording | Deciding what qualifies |
| [Art. 15](https://eur-lex.europa.eu/legal-content/EN/TXT/HTML/?uri=CELEX:32019L0882#art_15) | Presumption of conformity through harmonised standards in the Official Journal | Reports the status of EN 301 549 (below) | Conformity assessment |
| [Art. 31(2)](https://eur-lex.europa.eu/legal-content/EN/TXT/HTML/?uri=CELEX:32019L0882#art_31), [Art. 32(1)](https://eur-lex.europa.eu/legal-content/EN/TXT/HTML/?uri=CELEX:32019L0882#art_32) | Member States apply the measures "from 28 June 2025". Art. 32(1): "a transitional period ending on 28 June 2030 during which service providers may continue to provide their services using products which were lawfully used by them to provide similar services before that date"; "Service contracts agreed before 28 June 2025 may continue without alteration until they expire, but no longer than five years from that date." | Documented here, quoted from the official text | How the transition applies to you |
| [Directive (EU) 2016/2102 Art. 7](https://eur-lex.europa.eu/legal-content/EN/TXT/HTML/?uri=CELEX:32016L2102), [Implementing Decision (EU) 2018/1523](https://eur-lex.europa.eu/legal-content/EN/TXT/HTML/?uri=CELEX:32018D1523) | Public sector accessibility statement, model | Statement generator with the official model text | Private service providers (use Annex V instead) |

Every WCAG 2.1 Level A and AA success criterion maps to EN 301 549 clause 9.x.y.z, where x.y.z is the WCAG number. The project checks this against the clause list read from the published standard (`npm test`, `test/mapping.test.ts`). Run `kerbcut mapping` to see which axe-core rule maps to which criterion and clause.

Kerbcut also checks three things axe-core does not, or not in the same way:

- **Page language**: the `lang` value of every page is recorded; a missing or malformed tag is a violation of WCAG 3.1.1 / EN 9.3.1.1 (only reported when axe-core did not already report it).
- **Focus visible** (heuristic): it moves focus with the Tab key and compares how elements look with and without focus. No visible change is reported as "needs review" under WCAG 2.4.7 / EN 9.2.4.7.
- **Link to accessibility information** (heuristic): it looks for links whose text or address suggests an accessibility statement or accessibility information, in all EU languages.

## EN 301 549 version status

Checked on EUR-Lex on 8 November 2026:

- **EN 301 549 V3.2.1 (2021-03)** is cited in the Official Journal under Directive (EU) 2016/2102 ([Implementing Decision (EU) 2021/1339](https://eur-lex.europa.eu/legal-content/EN/TXT/HTML/?uri=CELEX:32021D1339)). It is not cited under Directive (EU) 2019/882. Its clause 9 follows WCAG 2.1. Kerbcut uses its clause numbers by default.
- **EN 301 549 V4.1.1 (2026-09)** was prepared for Directive (EU) 2019/882 (Annex ZB and clause A.2) and follows WCAG 2.2. It was adopted on 24 August 2026. No reference to it is published in the Official Journal yet, so it does not yet give a presumption of conformity under Article 15(1). Use `--en301549 V4.1.1 --wcag22` to report against it.
- No harmonised standard is cited in the Official Journal under Directive (EU) 2019/882 yet. Until one is, there is no presumption of conformity under Article 15(1); the requirements of Annex I apply directly.

Check EUR-Lex again before you rely on this: the status may change after this release.

## Limitations

- Automated rules find only part of accessibility issues. Many WCAG criteria (captions quality, meaningful sequence, error suggestions, and others) need people.
- Only pages reachable by links from the start URL, on the same origin, without login, are scanned.
- Mobile apps, PDF and office documents are not scanned.
- The focus and accessibility-link checks are heuristics and give false positives and false negatives.
- A hostile page can lie to the scanner about its own content. Results are validated and capped, but a page that wants to look clean can.
- The Annex V generator does not check what you write. The statement generator leaves grammar choices to you.
- The EN 301 549 status above is a snapshot.
- A robots.txt larger than 512 KiB is treated as "disallow everything". This is a cautious choice; RFC 9309 section 2.5 only asks crawlers to parse at least 500 KiB. A server error or network failure for robots.txt also means "disallow everything", as RFC 9309 section 2.3.1.4 requires. A 4xx answer means "allow everything" (section 2.3.1.3).

## Dependencies

Runtime:

- **playwright-core 1.64.1** (Apache-2.0): drives Chromium so pages render as users see them, with request interception that the SSRF guard needs. `playwright-core` is used instead of `playwright` because it has no install step; you install Chromium once with `npx playwright-core install chromium-headless-shell`.
- **axe-core 4.14.0** (MPL-2.0): the accessibility rule engine. It is the most used open rule set, tags each rule with WCAG criteria, and runs in the page without network access.

Both are pinned to exact versions. There are no other runtime dependencies. Development tools (TypeScript, ESLint, Vitest) are listed in `package.json` and pinned in `package-lock.json`.

Data sources, with the date they were read (2026-11-08): EUR-Lex HTML of CELEX 32019L0882 and 32018D1523 in all languages (SHA-256 of each source file is stored with the text), W3C WCAG 2.1 and 2.2 Recommendations (criterion numbers, titles, levels), ETSI EN 301 549 V3.2.1 and V4.1.1 (clause numbers and headings only). The scripts in `scripts/` rebuild the data.

## Translations that need review

These texts are translations made for this project, not official texts. They are marked `source: "translation"` in the data and need review by native speakers:

- Annex V document headings and labels (`src/generators/labels.ts`) in: bg, es, cs, da, de, et, el, fr, ga, hr, it, lv, lt, hu, mt, nl, pl, pt, ro, sk, sl, fi, sv.
- Search hints for the accessibility-link heuristic (`src/scan/checks.ts`). They are search words, not legal text.

The legal text quoted in the documents and the model statement text are official.

## Security

Kerbcut fetches pages from the internet, so it guards against server-side request forgery. In short:

- Only http and https, only ports 80 and 443 by default, no credentials in URLs.
- Every host name is resolved and every address is checked. Private, loopback, link-local, CGNAT, multicast, reserved, documentation, IPv6 unique-local and link-local, IPv4-mapped IPv6 and cloud metadata addresses are refused. Decimal, octal and hexadecimal IPv4 forms are normalised first and then checked.
- Chromium runs with its own sandbox by default (see [Quick start](#quick-start) and [Docker](#docker) for where it cannot).
- Chromium never connects itself. Every request, including every redirect hop and every sub-resource, is intercepted, checked, and fetched by Node with the checked address pinned. Chromium's own DNS is switched off. WebSockets, service workers and downloads are blocked. POST is blocked unless you allow it.
- No cookies or credentials are sent. Set-Cookie is dropped.
- Limits on pages, depth, total time, page time, response size (also after decompression), bytes per page (charged while responses stream in), requests per page and redirects. Pop-ups a page opens are closed after that page.
- Output files stay inside the working directory and are never written through symbolic links.

See [SECURITY.md](SECURITY.md) for the threat model and how to report a vulnerability.

## Licence and Enterprise

Kerbcut is free software under the [GNU Affero General Public License v3.0 only](LICENSE), with an [additional term under section 7(b)](LICENSE-ADDITIONAL-TERMS.md): keep the "Kerbcut by AFKzona Group" attribution and link in the user interface and in generated reports.

A commercial licence is available for organisations that cannot accept the AGPL obligations. See [COMMERCIAL.md](COMMERCIAL.md).

### Enterprise

AFKzona Group offers, separately from this repository:

- a hosted dashboard,
- continuous monitoring of many sites,
- SSO/SAML and roles,
- audit evidence packs,
- a legal-update feed,
- white-label reports,
- support with an SLA.

These are not part of the open source code. Contact info@afkzonagroup.lt.

"Kerbcut" is a trademark of AFKzona Group. See [TRADEMARKS.md](TRADEMARKS.md).

## Contributing

Read [CONTRIBUTING.md](CONTRIBUTING.md). Pull requests need a signed [CLA](CLA.md). Run `npm run check` before you open one.

## Disclaimer

This software is not legal advice. It does not make any website, service or organisation compliant with any law. Automated testing finds only part of accessibility issues. Check the official texts on EUR-Lex and get legal advice for your situation.

Maintained by AFKzona Group.
