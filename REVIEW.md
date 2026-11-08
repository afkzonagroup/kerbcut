# Review record

Two review passes were made before the first release, as required by the project standards. This file records what was checked, what was found and what was fixed. An independent review follows.

State at the end of both passes: `npm run check` passes (typecheck, ESLint strict type-checked rules, 387 Vitest tests, coverage 94.8 % lines, 82.2 % branches). `npm audit --omit=dev`: 0 vulnerabilities.

## Pass 1: correctness, law, API, tests, security checklist

### Legal accuracy (checked against the official texts on EUR-Lex, 8 November 2026)

| Item | Source checked | Result |
|---|---|---|
| Scope of services, e-commerce definition | Directive (EU) 2019/882 Art. 2(2)(f), Art. 3(30) (was cited as 3(31); corrected in the independent review) | Matches README |
| Accessibility requirements for services | Art. 4(3), Annex I Section III, Section IV(g) | Extracted verbatim, 24 languages |
| Microenterprise exemption and definition | Art. 4(5), Art. 3(23) | Quoted verbatim; tool does not decide eligibility |
| Service provider obligations | Art. 13(1) to (5) | Annex V generator covers 13(2); 13(3) as a documented process field |
| Fundamental alteration, disproportionate burden | Art. 14, Annex VI | Recorded, not assessed |
| Presumption of conformity | Art. 15(1) | Status of EN 301 549 documented |
| Dates | Art. 31(1) 28 June 2022, Art. 31(2) 28 June 2025, Art. 32(1) 28 June 2030 | README quotes Art. 32(1) verbatim (see finding 7) |
| Annex V content | Annex V points 1(a) to (c), 2, 3 | Quoted verbatim |
| Content not covered | Art. 2(4)(a) to (e) | Quoted verbatim |
| Corrigenda | 32019L0882R(01) to R(05) | Only R(05) (HR, Annex I Section III(d)) touches extracted text; applied and tested |
| Pending amendments | COM(2026) 590 | Only public-procurement cross-references (Art. 24); no change to service provider obligations |
| Harmonised standard under 2019/882 | EUR-Lex relations of 32019L0882, search for implementing decisions | None published in the Official Journal |
| EN 301 549 V3.2.1 | Implementing Decision (EU) 2021/1339 amending (EU) 2018/2048 | Cited under Directive (EU) 2016/2102 only |
| EN 301 549 V4.1.1 | ETSI deliverable, foreword | Adopted 24 August 2026, prepared under C(2022) 6456 for 2019/882, WCAG 2.2, not yet cited in the OJ |
| Clause 9 numbering | ETSI EN 301 549 V3.2.1 and V4.1.1 PDFs | 9.x.y.z = WCAG x.y.z; AAA numbers in range are "Void"; V4.1.1 makes 9.4.1.1 Void and adds six WCAG 2.2 clauses; titles match WCAG (test) |
| WCAG 2.1 list | W3C Recommendation (edition 6 May 2025) | 78 criteria, 30 A, 20 AA |
| Model statement | Implementing Decision (EU) 2018/1523, 23 language versions | Irish version not on EUR-Lex; 75-block structure identical in all languages (test) |
| Separation of regimes | 2019/882 vs 2016/2102 | Separate generators, separate docs; statement generator labelled public sector only |

### Findings and fixes

1. **Fulfilled redirects bypass interception.** A smoke test showed that when a route is fulfilled with a 3xx, Chromium follows the redirect without sending it back through request interception. The request failed only because Chromium's own DNS was switched off (defence in depth worked). Fix: main-document redirects are now followed by the scanner one checked hop at a time; sub-resource redirects are followed in Node with each hop checked. Tests: `test/scanner.test.ts` (redirect to private address, metadata redirect of an image).
2. **Focus heuristic false negative.** Chromium changes `outline-offset` on focus even when the outline is `none`, so every element looked "changed". Fix: compare a visual signature (outline and borders only when drawn). Test: `test/playwright-helper.test.ts`.
3. **Markdown escaping broke words.** Line-start escaping was applied to inline text that continues a line (Hungarian suffix "-t"). Fix: `atLineStart` option. Test: `test/escape.test.ts`.
4. **French model text has no space before a placeholder** ("avec[xxx]"). Fix: a space is inserted between a letter and a filled value. Official text otherwise unchanged.
5. **Statement status "full" could contradict the facts.** Fix: refused when the scan found violations or when non-compliances or a disproportionate burden are listed (endnote iii of the model). Test added.
6. **Report type did not fit the generators' input type** (readonly arrays). Fix: validators return readonly arrays.
7. **Article 32 paraphrase.** The README paraphrased Art. 32(1) and in doing so interpreted "before that date". Fix: quoted verbatim.
8. **Requests from pop-up pages had no budget.** Fix: requests from pages the scanner did not open are aborted. Test: `test/browser-route.test.ts`.
9. **Crawl memory not bounded.** The set of seen URLs grew with every link found. Fix: only queued URLs are remembered; queue is capped.
10. **Final URL not capped.** Fix: capped at 2048 characters.
11. **Unused config field.** `service.category` was required but unused. Fix: used to allow Annex I Section IV(g) points only for e-commerce services. Test added.
12. **Missing output directories** made CI templates fragile. Fix: created inside the working directory after a symlink-safe check. Tests added.
13. **JSON Schema not shipped.** Fix: `schema/` in the `files` list and in `exports`.
14. **Code of conduct** contained template front matter. Removed.
15. **Node 20 is end of life.** `engines` raised to `>=22`; README and CONTRIBUTING updated.
16. **Repository URL.** Changed to `github.com/afkzonagroup/kerbcut`.

### Security checklist (line by line)

| Control | Status |
|---|---|
| Threat model in SECURITY.md (assets, actors, boundaries, mitigations) | Done |
| Input validation at every boundary with size, length, type checks and allow-lists | Config, report files, CLI args, page results |
| No eval / new Function / dynamic import of input / child_process / innerHTML | None. ESLint rules enforce `no-eval`, `no-new-func`, `innerHTML`/`outerHTML`/`insertAdjacentHTML` and `child_process` bans. The only string evaluation is `page.evaluate(axeCore.source)`, which runs the pinned axe-core source in the scanned page. |
| SSRF: http/https only, DNS resolution, private/loopback/link-local/multicast/CGNAT/ULA/metadata blocked | Done, with IPv4-mapped, IPv4-compatible, NAT64, 6to4, documentation and reserved ranges |
| Re-check on every redirect and sub-request | Done (Node client, route interception, main-document loop) |
| Caps: redirects, response size, time, pages | Done, plus depth, bytes per page, requests per page, queue |
| robots.txt option | Done (RFC 9309), default on |
| No cookies or credentials | Done; tested at the server |
| Safe output paths, no symlink writes | Done; tested |
| Supply chain: lockfile, exact pins, `files` allow-list, no install scripts, audit clean, Dependabot | Done |
| CI on `pull_request` and `workflow_dispatch` only, pinned SHAs, read-only permissions | Done; tested |
| Test fails if a control is removed | SSRF ranges, redirect checks, pinning, cookie stripping, size/time limits, escaping, path checks, POST block, WebSocket block, pop-up block each have a test |

## Pass 2: hostile contributor and attacker view

| Attack tried | Result |
|---|---|
| Redirect chains to private, metadata and decimal-encoded loopback addresses | Blocked at the hop |
| DNS rebinding: first answer public (loopback in test), second private | Second request blocked; server saw only the first; connection always to the checked address |
| IPv6 tricks: `[::ffff:127.0.0.1]`, `[::ffff:7f00:1]`, `[64:ff9b::a9fe:a9fe]`, `[2002:7f00:1::]`, `fd00:ec2::254` | Blocked |
| Numeric host forms: `2130706433`, `0x7f.1`, `0177.0.0.1`, `017700000001`, `127.1`, `0` | Blocked after URL normalisation |
| Host names: `localhost`, `*.local`, `metadata.google.internal`, single labels, numeric last label | Blocked |
| Page script: POST via fetch, WebSocket, cookies, service worker, pop-ups | POST and pop-up requests aborted, WebSocket closed, no cookie reached the server |
| Page that runs `for(;;){}` | Page time limit ends it; scan continues (test added in this pass) |
| Page with many iframes | Request budget per page enforced (test added in this pass) |
| Decompression bomb, huge Content-Length, endless body | Stopped at the size or time limit |
| Page that replaces `window.axe` and returns invented rule ids, bogus impacts and huge strings | Unknown ids dropped, impact discarded, strings capped, descriptions taken from axe-core in Node |
| HTML injection through URLs, titles, selectors, help URLs (`javascript:`) in the report | Escaped; no `javascript:` links; CSP `default-src 'none'` with a hashed style sheet; no scripts |
| Markdown injection through config text (headings, links, raw HTML) | Escaped |
| Config with `__proto__`, unknown keys, control characters, oversized files, directories instead of files | Refused |
| Output to `../x`, through a symlinked directory, onto a symlinked file, with NUL bytes | Refused; target file unchanged |
| GitHub Action input with shell metacharacters | Inputs only reach the script as environment variables and separate arguments (test) |
| GitHub Action `report-dir` with a line break to inject into `$GITHUB_OUTPUT` | **Found.** Fixed: multi-line values are refused before anything is written |
| Regular expressions on input (host names, e-mail, language tags) for catastrophic backtracking | Measured on worst-case strings: under 1 ms; lengths are capped before matching |
| Trojan Source: bidirectional or invisible characters in source, docs or data | None found. A test now fails if any appear (`test/hygiene.test.ts`) |
| Agent or scratch files in the tree | None; local tool files are kept out of the tracked tree (no test; corrected in the independent review) |

### Residual risks (accepted and documented)

- The Playwright test helper does not apply the SSRF guard; it never navigates (documented).
- A page can detect the scanner and serve different content. The User-Agent names the tool on purpose so that robots.txt rules can target it.
- Development-only dependencies (ESLint, typescript-eslint) carry a moderate advisory in `minimatch`; it does not reach the published package (`npm audit --omit=dev` is clean).
- The Docker image is 1.2 GB because Chromium needs system libraries and fonts.
- A robots.txt larger than 512 KiB is treated as "disallow everything".
- The Annex V headings in 23 languages are unreviewed translations, marked as such in data and README.
- The EN 301 549 status is a snapshot of 8 November 2026.

## Items for the independent review

- Confirm on EUR-Lex that no implementing decision citing EN 301 549 (or any harmonised standard) under Directive (EU) 2019/882 has appeared since 8 November 2026.
- Spot-check the verbatim extraction for a few languages against the EUR-Lex pages (each source file's SHA-256 is stored in the data).
- Native-speaker review of `src/generators/labels.ts`.
- Confirm the legal entity name "MB AFKzona Group" before publishing.

## Independent review

A separate reviewer checked the code and the law again without relying on this file or the README. Date: 8 November 2026.

### What was checked

| Area | How |
|---|---|
| Verbatim legal text | Downloaded Directive (EU) 2019/882 and Implementing Decision (EU) 2018/1523 from the Publications Office (the source of EUR-Lex) in English, German, French, Polish, Lithuanian, Bulgarian and Italian. Compared every shipped string of those languages (act titles, article headings and titles, Article 2(4), Article 4(5), Annex I Sections III and IV(g), Annex V, all 75 blocks of the model statement): 875 strings, all found word for word after whitespace normalisation and removal of the endnote markers the model says to delete. |
| Articles behind the claims | Read Articles 2, 3, 4, 13, 14, 15, 31, 32, Annex I Sections III and IV and Annex V in English. README quotes of Article 31(2) and 32(1) are exact. |
| EN 301 549 status | Implementing Decision (EU) 2021/1339 confirms V3.2.1 under Directive (EU) 2016/2102. The V4.1.1 foreword confirms adoption on 24 August 2026, request C(2022) 6456, Annex ZB and clause A.2. A query of the Publications Office index for every implementing decision on harmonised standards from 2022 to 28 October 2026 found none under Directive (EU) 2019/882 and no change to Implementing Decision (EU) 2018/2048. |
| Clause 9 tables and mapping | All 55 (V3.2.1) and 69 (V4.1.1) clause numbers and headings match the ETSI PDFs. The WCAG tags of all 105 axe-core 4.14.0 rules match the generated mapping. 9.x.y.z = WCAG x.y.z holds in both versions. The Annex V generator and the statement generator never quote each other's legal basis. |
| SSRF, live | A hostile page on the test server tried to reach a private LAN address on an allowed port with fetch, keepalive fetch, sendBeacon, `<a ping>`, EventSource, WebSocket (page and worker), dedicated and shared worker fetch, iframe, pop-up, form submission, prefetch, preconnect, preload, speculation rules prerender, CSS, video, WebRTC STUN and TURN (UDP and TCP) and WebTransport. The same page in an unguarded Chromium reached the address 31 times; through Kerbcut, 0 times. |
| Controls under removal | 40 security controls were removed one at a time and the suite re-run (see below). |
| README | Quick start run from the packed tarball in an empty directory against https://www.example.com/: works. Docker image built and run with the documented hardened flags: works. |
| Supply chain | Action SHAs resolve to the tags named in the comments. `npm pack` contains only the allow-listed files. |
| Publish gate | Every commit has antonmacius-droid as author and committer; no attribution lines; no tracked file contains a tool name. |

### Findings and fixes

| # | Severity | Finding | Fix | Test |
|---|---|---|---|---|
| 1 | High | Chromium always ran with `--no-sandbox` (Playwright's default), while it renders untrusted pages and their third-party resources. A renderer exploit would have run with the user's rights; in CI that includes the checked-out repository and its stored token. | Chromium's sandbox is on by default. Turning it off needs `--no-browser-sandbox`, `browserSandbox: false` or `KERBCUT_BROWSER_SANDBOX=off` and prints a note; a failed sandbox start gives a clear error. The Docker image turns it off (Docker's default seccomp profile blocks user namespaces) and the README runs it with `--cap-drop=ALL --security-opt no-new-privileges`. The Action allows unprivileged user namespaces on GitHub-hosted runners only and stops with an error on self-hosted ones. | `test/browser-route.test.ts`, `test/cli.test.ts` |
| 2 | Medium | The bytes-per-page limit was checked before a request and charged after it finished. Parallel requests could each take the whole remaining budget: up to 300 × 5 MiB in memory with defaults, 2000 × 50 MiB at the maxima. | A shared budget is charged while bodies stream in. | `test/http.test.ts`, `test/scanner.test.ts` |
| 3 | Medium | The Action wrote `violations` from any `report.json` in `report-dir`, also when the scan had failed (a stale or committed file), without checking the value, so a crafted file could add lines to `$GITHUB_OUTPUT`. | Outputs only after exit code 0 or 1, and `violations` only as a non-negative integer. | `test/action-script.test.ts` (runs the step's script in bash) |
| 4 | Medium | README and this file cited Article 3(31) as the definition of e-commerce services. Article 3(31) defines air passenger transport services; e-commerce is Article 3(30). | Corrected. | — |
| 5 | Medium | The Annex V generator accepts banking, electronic communications, audiovisual media, passenger transport and e-book services, but can only quote Annex I Section III and Section IV(g). For those services Section IV points (a) to (f) also apply, so the generated document looked complete when it was not. | The output has `notes` naming the missing Section IV point; the CLI prints it; the README states the limit. Extending the generator is an open decision (below). | `test/annex-v.test.ts`, `test/cli.test.ts` |
| 6 | Low | Pop-ups opened by a page stayed open, with their scripts running, until the whole scan ended. | Every page of the context is closed after each scanned page. | `test/scanner.test.ts` |
| 7 | Low | After a size failure the decompressor was not destroyed and the data handler kept counting. | Decompressor destroyed; handler stops once the request has settled. | `test/http.test.ts` |
| 8 | Low | Title, links and `lang` were copied from the page to Node in full before being cut. | Cut inside the page first, then again in Node. A page that replaces built-ins can still send large values; documented as a residual risk. | existing tests |
| 9 | Low | Cross-field errors in the Annex V config (Section IV(g) for non-e-commerce, no contact channel) threw a plain `Error` instead of `ValidationError`. | `ValidationError`. | `test/annex-v.test.ts` |
| 10 | Low | Annex V point 2 is quoted above the standards the provider lists. Listing EN 301 549 there can read as a presumption of conformity, which no standard gives under Directive (EU) 2019/882 yet. | README says so. | — |
| 11 | Low | Removing these controls left the suite green: WebSocket route, service-worker block, "disallow everything" for a failing robots.txt, the redirect-depth check, the Action's single-line check, the parent-directory symlink check, and the sandbox option of `scan()`. | Tests added for each. | as listed |
| 12 | Info | Playwright's `serviceWorkers: 'block'` only replaces `navigator.serviceWorker.register` with a stub. A bypass through a fresh iframe was tried and failed (the stub is installed in child frames too). | Documented in SECURITY.md; network-level protection does not depend on it. | `test/scanner.test.ts` |
| 13 | Info | This file said 387 tests (there were 386) and that a test checks for tool files (none did). | Corrected above. | — |

### Controls under removal

Removed one at a time with the suite re-run. Now caught: pop-up abort, Chromium resolver switch, WebRTC policy, service-worker block, sub-resource and main-document redirect checks, port, credentials, every DNS answer judged, pinned connection, DNS timeout, blocked host suffixes, IPv6 metadata address, NAT64, 6to4, request header allow-list, Set-Cookie removal, streamed size cap, streamed page budget, output path checks for parent directories, `safeHref`, CSP, unknown axe rule ids, Markdown line-start escaping, robots "disallow everything", POST block, redirect depth, guarded GET re-check, sandbox default in `launchBrowser`, `scan()` and the CLI, pop-up closing, and the three Action output checks.

Still green when removed alone, because another layer does the same job:

- `routeWebSocket`: documents fulfilled through interception cannot open WebSockets in this Chromium build, and Chromium's resolver switch refuses IP literals too. The test shows the combined behaviour.
- The `lstat` symlink check and `O_NOFOLLOW` in `writeFileSafe`: each alone stops writing through a symlink.
- The "inside the working directory" path check: the real-path check of the nearest existing parent catches the same paths.

### State after the independent review

`npm run check` passes: typecheck, lint, 19 test files, 403 tests, 95.0 % lines, 82.2 % branches. `npm audit --omit=dev`: 0 vulnerabilities.

### Open decisions for the owner

1. Extend the Annex V generator to Annex I Section IV points (a) to (f), with verbatim extraction in all 24 languages, or keep the documented limit for 0.1.0.
2. Run the Action and the CI workflow once on a GitHub-hosted runner before tagging, to confirm the user-namespace step and Chromium's sandbox work there.
3. Have licence counsel confirm that an AGPL section 7(b) term can require the attribution in generated reports (program output, not the program itself). The "white-label reports" offer depends on it.
4. Docker image: keep "sandbox off, container is the boundary", or ship a seccomp profile so the image can keep Chromium's sandbox.
5. Earlier commits contain removed lines that name local tool files. Squash the history before the first push, as planned in the publish gate.
