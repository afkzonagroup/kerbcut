// Copyright 2026 MB AFKzona Group
// SPDX-License-Identifier: AGPL-3.0-only
//
// EN 301 549 clause 9 ("Web") numbering. Clause numbers and headings were
// read from the published ETSI deliverables on 2026-11-08:
//   EN 301 549 V3.2.1 (2021-03)
//   https://www.etsi.org/deliver/etsi_en/301500_301599/301549/03.02.01_60/en_301549v030201p.pdf
//   EN 301 549 V4.1.1 (2026-09)
//   https://www.etsi.org/deliver/etsi_en/301500_301599/301549/04.01.01_60/en_301549v040101p.pdf
// Clause 9.x.y.z corresponds to WCAG success criterion x.y.z. Clauses for
// WCAG Level AAA criteria inside the numbering range are "Void".
// Only numbers and headings are reproduced, not the text of the standard.

/** Versions of EN 301 549 this project knows. */
export type En301549Version = 'V3.2.1' | 'V4.1.1';

/** One clause of EN 301 549 clause 9. */
export interface En301549Clause {
  /** Clause number, for example "9.1.4.3". */
  readonly clause: string;
  /** Heading as printed in the standard. "Void" means no requirement. */
  readonly heading: string;
}

/** Official status facts about each version, checked on EUR-Lex on 2026-11-08. */
export const EN301549_VERSIONS: Readonly<Record<En301549Version, {
  readonly title: string;
  readonly published: string;
  readonly url: string;
  readonly wcagBasis: '2.1' | '2.2';
  readonly status: string;
}>> = {
  'V3.2.1': {
    title: 'EN 301 549 V3.2.1 (2021-03)',
    published: '2021-03',
    url: 'https://www.etsi.org/deliver/etsi_en/301500_301599/301549/03.02.01_60/en_301549v030201p.pdf',
    wcagBasis: '2.1',
    status:
      'Reference published in the Official Journal under Directive (EU) 2016/2102 by Commission Implementing Decision (EU) 2021/1339 (amending Implementing Decision (EU) 2018/2048). Not published in the Official Journal under Directive (EU) 2019/882.',
  },
  'V4.1.1': {
    title: 'EN 301 549 V4.1.1 (2026-09)',
    published: '2026-09',
    url: 'https://www.etsi.org/deliver/etsi_en/301500_301599/301549/04.01.01_60/en_301549v040101p.pdf',
    wcagBasis: '2.2',
    status:
      'Prepared under standardisation request C(2022) 6456 in support of Directive (EU) 2019/882 (Annex ZB, clause A.2). Adopted 24 August 2026. As of 2026-11-08 no reference to it is published in the Official Journal, so it does not yet give a presumption of conformity under Article 15(1) of Directive (EU) 2019/882.',
  },
};

/** EN 301 549 V3.2.1 clause 9 leaf clauses (9.x.y.z), in order. */
export const EN301549_V3_2_1_CLAUSE9: readonly En301549Clause[] = [
  { clause: '9.1.1.1', heading: 'Non-text content' },
  { clause: '9.1.2.1', heading: 'Audio-only and video-only (pre-recorded)' },
  { clause: '9.1.2.2', heading: 'Captions (pre-recorded)' },
  { clause: '9.1.2.3', heading: 'Audio description or media alternative (pre-recorded)' },
  { clause: '9.1.2.4', heading: 'Captions (live)' },
  { clause: '9.1.2.5', heading: 'Audio description (pre-recorded)' },
  { clause: '9.1.3.1', heading: 'Info and relationships' },
  { clause: '9.1.3.2', heading: 'Meaningful sequence' },
  { clause: '9.1.3.3', heading: 'Sensory characteristics' },
  { clause: '9.1.3.4', heading: 'Orientation' },
  { clause: '9.1.3.5', heading: 'Identify input purpose' },
  { clause: '9.1.4.1', heading: 'Use of colour' },
  { clause: '9.1.4.2', heading: 'Audio control' },
  { clause: '9.1.4.3', heading: 'Contrast (minimum)' },
  { clause: '9.1.4.4', heading: 'Resize text' },
  { clause: '9.1.4.5', heading: 'Images of text' },
  { clause: '9.1.4.6', heading: 'Void' },
  { clause: '9.1.4.7', heading: 'Void' },
  { clause: '9.1.4.8', heading: 'Void' },
  { clause: '9.1.4.9', heading: 'Void' },
  { clause: '9.1.4.10', heading: 'Reflow' },
  { clause: '9.1.4.11', heading: 'Non-text contrast' },
  { clause: '9.1.4.12', heading: 'Text spacing' },
  { clause: '9.1.4.13', heading: 'Content on hover or focus' },
  { clause: '9.2.1.1', heading: 'Keyboard' },
  { clause: '9.2.1.2', heading: 'No keyboard trap' },
  { clause: '9.2.1.3', heading: 'Void' },
  { clause: '9.2.1.4', heading: 'Character key shortcuts' },
  { clause: '9.2.2.1', heading: 'Timing adjustable' },
  { clause: '9.2.2.2', heading: 'Pause, stop, hide' },
  { clause: '9.2.3.1', heading: 'Three flashes or below threshold' },
  { clause: '9.2.4.1', heading: 'Bypass blocks' },
  { clause: '9.2.4.2', heading: 'Page titled' },
  { clause: '9.2.4.3', heading: 'Focus Order' },
  { clause: '9.2.4.4', heading: 'Link purpose (in context)' },
  { clause: '9.2.4.5', heading: 'Multiple ways' },
  { clause: '9.2.4.6', heading: 'Headings and labels' },
  { clause: '9.2.4.7', heading: 'Focus visible' },
  { clause: '9.2.5.1', heading: 'Pointer gestures' },
  { clause: '9.2.5.2', heading: 'Pointer cancellation' },
  { clause: '9.2.5.3', heading: 'Label in name' },
  { clause: '9.2.5.4', heading: 'Motion actuation' },
  { clause: '9.3.1.1', heading: 'Language of page' },
  { clause: '9.3.1.2', heading: 'Language of parts' },
  { clause: '9.3.2.1', heading: 'On focus' },
  { clause: '9.3.2.2', heading: 'On input' },
  { clause: '9.3.2.3', heading: 'Consistent navigation' },
  { clause: '9.3.2.4', heading: 'Consistent identification' },
  { clause: '9.3.3.1', heading: 'Error identification' },
  { clause: '9.3.3.2', heading: 'Labels or instructions' },
  { clause: '9.3.3.3', heading: 'Error suggestion' },
  { clause: '9.3.3.4', heading: 'Error prevention (legal, financial, data)' },
  { clause: '9.4.1.1', heading: 'Parsing' },
  { clause: '9.4.1.2', heading: 'Name, role, value' },
  { clause: '9.4.1.3', heading: 'Status messages' },
];

/** EN 301 549 V4.1.1 clause 9 leaf clauses (9.x.y.z), in order. */
export const EN301549_V4_1_1_CLAUSE9: readonly En301549Clause[] = [
  { clause: '9.1.1.1', heading: 'Non-text content' },
  { clause: '9.1.2.1', heading: 'Audio-only and video-only (pre-recorded)' },
  { clause: '9.1.2.2', heading: 'Subtitles (pre-recorded)' },
  { clause: '9.1.2.3', heading: 'Audio description or media alternative (pre-recorded)' },
  { clause: '9.1.2.4', heading: 'Subtitles (live)' },
  { clause: '9.1.2.5', heading: 'Audio description (pre-recorded)' },
  { clause: '9.1.3.1', heading: 'Info and relationships' },
  { clause: '9.1.3.2', heading: 'Meaningful sequence' },
  { clause: '9.1.3.3', heading: 'Sensory characteristics' },
  { clause: '9.1.3.4', heading: 'Orientation' },
  { clause: '9.1.3.5', heading: 'Identify input purpose' },
  { clause: '9.1.4.1', heading: 'Use of colour' },
  { clause: '9.1.4.2', heading: 'Audio control' },
  { clause: '9.1.4.3', heading: 'Contrast (minimum)' },
  { clause: '9.1.4.4', heading: 'Resize text' },
  { clause: '9.1.4.5', heading: 'Images of text' },
  { clause: '9.1.4.6', heading: 'Void' },
  { clause: '9.1.4.7', heading: 'Void' },
  { clause: '9.1.4.8', heading: 'Void' },
  { clause: '9.1.4.9', heading: 'Void' },
  { clause: '9.1.4.10', heading: 'Reflow' },
  { clause: '9.1.4.11', heading: 'Non-text contrast' },
  { clause: '9.1.4.12', heading: 'Text spacing' },
  { clause: '9.1.4.13', heading: 'Content on hover or focus' },
  { clause: '9.2.1.1', heading: 'Keyboard' },
  { clause: '9.2.1.2', heading: 'No keyboard trap' },
  { clause: '9.2.1.3', heading: 'Void' },
  { clause: '9.2.1.4', heading: 'Character key shortcuts' },
  { clause: '9.2.2.1', heading: 'Timing adjustable' },
  { clause: '9.2.2.2', heading: 'Pause, stop, hide' },
  { clause: '9.2.3.1', heading: 'Three flashes or below threshold' },
  { clause: '9.2.4.1', heading: 'Bypass blocks' },
  { clause: '9.2.4.2', heading: 'Page titled' },
  { clause: '9.2.4.3', heading: 'Focus order' },
  { clause: '9.2.4.4', heading: 'Link purpose (in context)' },
  { clause: '9.2.4.5', heading: 'Multiple ways' },
  { clause: '9.2.4.6', heading: 'Headings and labels' },
  { clause: '9.2.4.7', heading: 'Focus visible' },
  { clause: '9.2.4.8', heading: 'Void' },
  { clause: '9.2.4.9', heading: 'Void' },
  { clause: '9.2.4.10', heading: 'Void' },
  { clause: '9.2.4.11', heading: 'Focus not obscured (minimum)' },
  { clause: '9.2.5.1', heading: 'Pointer gestures' },
  { clause: '9.2.5.2', heading: 'Pointer cancellation' },
  { clause: '9.2.5.3', heading: 'Label in name' },
  { clause: '9.2.5.4', heading: 'Motion actuation' },
  { clause: '9.2.5.5', heading: 'Void' },
  { clause: '9.2.5.6', heading: 'Void' },
  { clause: '9.2.5.7', heading: 'Dragging movements' },
  { clause: '9.2.5.8', heading: 'Target size (minimum)' },
  { clause: '9.3.1.1', heading: 'Language of page' },
  { clause: '9.3.1.2', heading: 'Language of parts' },
  { clause: '9.3.2.1', heading: 'On focus' },
  { clause: '9.3.2.2', heading: 'On input' },
  { clause: '9.3.2.3', heading: 'Consistent navigation' },
  { clause: '9.3.2.4', heading: 'Consistent identification' },
  { clause: '9.3.2.5', heading: 'Void' },
  { clause: '9.3.2.6', heading: 'Consistent help' },
  { clause: '9.3.3.1', heading: 'Error identification' },
  { clause: '9.3.3.2', heading: 'Labels or instructions' },
  { clause: '9.3.3.3', heading: 'Error suggestion' },
  { clause: '9.3.3.4', heading: 'Error prevention (legal, financial, data)' },
  { clause: '9.3.3.5', heading: 'Void' },
  { clause: '9.3.3.6', heading: 'Void' },
  { clause: '9.3.3.7', heading: 'Redundant entry' },
  { clause: '9.3.3.8', heading: 'Accessible authentication (minimum)' },
  { clause: '9.4.1.1', heading: 'Void' },
  { clause: '9.4.1.2', heading: 'Name, role, value' },
  { clause: '9.4.1.3', heading: 'Status messages' },
];

