# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project follows [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.1.1] - 2026-11-08

### Fixed

- Statement generator tidies whitespace in linear time (#20).
- Release workflow installs Chromium and allows its sandbox, as CI does (#19).

### Added

- Action self-test on a GitHub-hosted runner (#23).
- Container image `ghcr.io/afkzonagroup/kerbcut`, published by the release
  workflow after a smoke test (version, attribution, a one-page scan with all
  capabilities dropped), with SBOM, build provenance and a GitHub attestation.
  The GitLab template uses it.

### Changed

- Dependencies updated (#22); Dependabot groups minor and patch updates and ignores major versions (#18).
- Release workflow skips versions already on npm.

## [0.1.0] - 2026-11-08

### Added

- Scanner: same-origin crawler with Playwright (Chromium) and axe-core 4.14.0, WCAG 2.1 A/AA rules, optional WCAG 2.2 A/AA rules.
- Mapping of every axe-core rule to WCAG success criteria and EN 301 549 clause 9 (V3.2.1 by default, V4.1.1 optional).
- Kerbcut checks: page language, focus visible (heuristic), link to accessibility information (heuristic).
- SSRF guard for every request, redirect and sub-resource; crawl and fetch limits; optional robots.txt (RFC 9309).
- Chromium runs with its own sandbox by default; `--no-browser-sandbox` or `KERBCUT_BROWSER_SANDBOX=off` turns it off inside disposable containers (the Docker image does this).
- JSON report (format 1.0.0, JSON Schema) and self-contained HTML report.
- Annex V service information generator (Directive (EU) 2019/882) in 24 languages with verbatim legal text.
- Public sector accessibility statement generator from the model in Implementing Decision (EU) 2018/1523, in the 23 languages published on EUR-Lex.
- CLI, library, GitHub Action, Docker image, GitLab CI template, Playwright test helper.
