// Copyright 2026 MB AFKzona Group
// SPDX-License-Identifier: AGPL-3.0-only

/** axe-core rule metadata used for mapping. */
export interface AxeRuleMeta {
  readonly id: string;
  /** WCAG success criteria from the rule's wcagNNN tags, for example "1.4.3". */
  readonly sc: readonly string[];
  /** WCAG version/level tags such as "wcag2a" or "wcag21aa". */
  readonly levelTags: readonly string[];
  /** axe-core's own EN 301 549 clause tags, without the "EN-" prefix. */
  readonly axeEnTags: readonly string[];
  readonly experimental: boolean;
  readonly deprecated: boolean;
  readonly bestPractice: boolean;
}
