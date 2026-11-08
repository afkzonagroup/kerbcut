# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project follows [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

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
