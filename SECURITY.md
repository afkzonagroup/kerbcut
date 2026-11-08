# Security

## Reporting a vulnerability

Please report vulnerabilities privately through GitHub Security Advisories: open the repository's **Security** tab and choose **Report a vulnerability**. Do not open a public issue.

If you cannot use GitHub, write to info@afkzonagroup.lt with "Kerbcut security" in the subject.

We confirm receipt within 5 working days, agree a fix and disclosure date with you, and credit you unless you prefer not to be named.

Supported versions: the latest 0.x release.

## Threat model

### Assets

- The network the scanner runs in: internal services, cloud metadata endpoints (instance credentials), the loopback interface of the machine.
- The machine running Kerbcut: files, processes, CPU, memory, disk.
- People who open reports and generated documents: their browsers.
- The integrity of the results: a report or document that says less than the truth can mislead.

### Actors

- **Scanned site owner (untrusted).** Controls every byte of the pages, redirects, DNS answers for their domain, robots.txt, and scripts that run in the scanner's browser.
- **User of the CLI, library, Action or Docker image (trusted for their own run).** Chooses the start URL, limits, config files and output paths. In shared CI, inputs may come from less trusted people (for example a pull request), so they are still validated.
- **Reader of a report or document.** Opens HTML files in a browser.
- **Contributor (untrusted until review).** Could try to slip in unsafe code or data.

### Trust boundaries

1. Network responses and page content → scanner (Node and Chromium).
2. Results returned by the page (axe-core output, links, styles) → Node.
3. Command line, config files, report files → CLI.
4. Report and document content → reader's browser or Markdown renderer.

### Threats and mitigations

| Threat | Mitigation | Code | Tests |
|---|---|---|---|
| SSRF to private, loopback, link-local, CGNAT, metadata, multicast, reserved or documentation addresses | Every URL is checked: http/https only, allowed ports only (80, 443 by default), no credentials, host-name shape rules, DNS resolution with every answer checked; IPv4 and IPv6 special-purpose ranges, IPv4-mapped, IPv4-compatible, NAT64 and 6to4 with embedded private addresses, cloud metadata addresses (169.254.169.254, 169.254.170.2, 100.100.100.200, 192.0.0.192, 168.63.129.16, fd00:ec2::254) | `src/net/ip.ts`, `src/net/ssrf.ts` | `test/ip.test.ts`, `test/ssrf.test.ts` |
| Decimal, octal, hexadecimal, short IPv4 forms | The WHATWG URL parser normalises them; the guard then checks the canonical address; non-canonical forms are never parsed as addresses by Kerbcut itself | `src/net/ssrf.ts` | `test/ssrf.test.ts` |
| DNS rebinding (check one address, connect to another) | The connection is made to the address that passed the check (pinned lookup); each request is resolved and checked again | `src/net/http.ts` | `test/http.test.ts`, `test/scanner.test.ts` |
| Redirect to an internal address | Redirects are never followed blindly: each hop is checked again (Node client, sub-resources, and main documents) | `src/net/http.ts`, `src/scan/browser.ts`, `src/scan/scanner.ts` | `test/http.test.ts`, `test/scanner.test.ts` |
| Browser sub-requests (images, scripts, iframes, fetch, workers) reaching internal addresses | Every request is intercepted and fetched by Node through the guard; Chromium's DNS is disabled (`--host-resolver-rules=MAP * ~NOTFOUND`), so anything not intercepted fails; WebSockets are closed; service workers blocked; non-proxied WebRTC disabled; non-http(s) schemes aborted | `src/scan/browser.ts` | `test/scanner.test.ts` |
| Code execution through a Chromium renderer exploit in a scanned page | Chromium runs with its own sandbox by default. Turning it off needs `--no-browser-sandbox`, `browserSandbox: false` or `KERBCUT_BROWSER_SANDBOX=off`, and prints a note. The Docker image turns it off because Docker's default seccomp profile blocks user namespaces; there the container (non-root, run with `--cap-drop=ALL --security-opt no-new-privileges`) is the boundary | `src/scan/browser.ts`, `src/cli/run.ts`, `Dockerfile`, `action.yml` | `test/browser-route.test.ts`, `test/cli.test.ts` |
| State-changing requests from the scanner | Only GET and HEAD unless `--allow-post` | `src/scan/browser.ts` | `test/scanner.test.ts` |
| Leaking credentials or cookies | No cookies, Authorization, Proxy or Referer headers are sent; Set-Cookie is dropped; each scan uses a fresh browser context | `src/net/http.ts`, `src/scan/browser.ts` | `test/http.test.ts`, `test/scanner.test.ts` |
| Resource exhaustion (huge pages, decompression bombs, slow servers, link farms, redirect loops, many parallel requests, pop-ups) | Limits with hard maxima: pages, depth, total time, page time, response size after decompression, bytes per page (charged while bodies stream in, so parallel requests cannot overrun it), requests per page, redirects, queue size, nodes per rule, robots.txt size. Pop-ups a page opens are closed when that page is done | `src/scan/options.ts`, `src/net/http.ts`, `src/scan/browser.ts`, `src/scan/scanner.ts` | `test/http.test.ts`, `test/scanner.test.ts` |
| Hostile page forging or bloating results | Results from the page are validated and capped; unknown rule ids are dropped; rule descriptions come from axe-core in Node, not from the page | `src/scan/axe.ts`, `src/scan/checks.ts` | `test/playwright-helper.test.ts` |
| XSS in the HTML report or generated HTML | Every value is HTML-escaped; links only for http(s) URLs; no scripts; inline styles only through one style sheet allowed by a CSP hash; `default-src 'none'` | `src/report/html.ts`, `src/report/html-shell.ts`, `src/generators/doc.ts`, `src/util/escape.ts` | `test/report.test.ts`, `test/annex-v.test.ts`, `test/statement.test.ts` |
| Markdown injection in generated documents | All values are escaped for Markdown (HTML entities, link and emphasis syntax, line-start markers) | `src/util/escape.ts`, `src/generators/doc.ts` | `test/escape.test.ts`, `test/annex-v.test.ts` |
| Malformed or hostile config and report files | Size limits, strict schemas with length limits and allow-lists, unknown keys refused, `__proto__` never copied | `src/config/v.ts`, `src/report/evidence.ts`, `src/util/fs-safe.ts` | `test/validate.test.ts`, `test/cli.test.ts` |
| Path traversal and symlink attacks on output files | Outputs must resolve inside the working directory (also after resolving symbolic links of parent directories); target files are opened with `O_NOFOLLOW` and refused if they are symbolic links | `src/util/fs-safe.ts` | `test/cli.test.ts` |
| Shell injection in the GitHub Action, injection into `$GITHUB_OUTPUT` | Inputs are passed as environment variables and separate arguments, never interpolated into script text. `report-dir` must be one line. Outputs are written only for a report from the current run, and `violations` only as a plain number | `action.yml` | `test/connectors.test.ts`, `test/action-script.test.ts` |
| Accidentally scanning loopback | Loopback is allowed only with the explicitly named option `unsafeAllowLoopbackForTesting` / `--unsafe-allow-loopback-for-testing`, which prints a warning; it never opens any other blocked range | `src/net/ssrf.ts`, `src/cli/run.ts` | `test/ssrf.test.ts`, `test/cli.test.ts` |
| Supply chain | Two runtime dependencies, exact versions, lockfile committed, no install scripts, `files` allow-list, `npm audit --omit=dev` clean, Dependabot, CI actions pinned by commit SHA | `package.json`, `.github/` | CI |

### Known residual risks

- The Playwright test helper runs on pages your tests open. It does not apply the SSRF guard, because it does not navigate.
- A page can make itself look accessible to the scanner (for example by detecting it). Kerbcut cannot prevent that.
- Chromium itself is a large attack surface. Keep Kerbcut and its Chromium build up to date. Where Chromium's sandbox is off (the Docker image, `--no-browser-sandbox`), run scans only in a disposable container or VM.
- Service workers are blocked by Playwright's `serviceWorkers: 'block'`, which replaces `navigator.serviceWorker.register` in every frame with a stub. That is a JavaScript-level control; the network-level guarantees come from request interception and Chromium's disabled name resolution.
- Data a hostile page returns to Node (axe-core results, links, title) is capped in the page and validated in Node, but a page that replaces built-in functions can still make that transfer large. The page time limit bounds it.
- The GitHub Action installs Chromium system dependencies with `apt-get` on the runner.

## Data flows

Kerbcut sends no telemetry. A scan contacts only the start URL's origin and the hosts the pages load resources from, through the guard. Reports and documents are written only where you tell it to write them. Nothing else leaves the machine.
