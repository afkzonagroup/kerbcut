// Copyright 2026 MB AFKzona Group
// SPDX-License-Identifier: AGPL-3.0-only
//
// WCAG success criteria. Numbers, titles and levels copied from the W3C
// Recommendations, retrieved 2026-11-08:
//   WCAG 2.1 (W3C Recommendation, edition of 6 May 2025): https://www.w3.org/TR/WCAG21/
//   WCAG 2.2 (W3C Recommendation, edition of 12 December 2024): https://www.w3.org/TR/WCAG22/
// WCAG 2.2 marks 4.1.1 Parsing as obsolete and removed.

/** A WCAG conformance level. */
export type WcagLevel = 'A' | 'AA' | 'AAA';

/** The four WCAG principles. */
export type WcagPrinciple = 'perceivable' | 'operable' | 'understandable' | 'robust';

/** One WCAG success criterion. */
export interface WcagCriterion {
  /** Success criterion number, for example "1.4.3". */
  readonly sc: string;
  readonly title: string;
  readonly level: WcagLevel;
  /** WCAG version that introduced the criterion. */
  readonly since: '2.0' | '2.1' | '2.2';
  /** Fragment id in the W3C Recommendation. */
  readonly id: string;
}

export const WCAG21_URL = 'https://www.w3.org/TR/WCAG21/';
export const WCAG22_URL = 'https://www.w3.org/TR/WCAG22/';

/** Every success criterion in WCAG 2.1, in document order. */
export const WCAG21: readonly WcagCriterion[] = [
  { sc: '1.1.1', title: 'Non-text Content', level: 'A', since: '2.0', id: 'non-text-content' },
  { sc: '1.2.1', title: 'Audio-only and Video-only (Prerecorded)', level: 'A', since: '2.0', id: 'audio-only-and-video-only-prerecorded' },
  { sc: '1.2.2', title: 'Captions (Prerecorded)', level: 'A', since: '2.0', id: 'captions-prerecorded' },
  { sc: '1.2.3', title: 'Audio Description or Media Alternative (Prerecorded)', level: 'A', since: '2.0', id: 'audio-description-or-media-alternative-prerecorded' },
  { sc: '1.2.4', title: 'Captions (Live)', level: 'AA', since: '2.0', id: 'captions-live' },
  { sc: '1.2.5', title: 'Audio Description (Prerecorded)', level: 'AA', since: '2.0', id: 'audio-description-prerecorded' },
  { sc: '1.2.6', title: 'Sign Language (Prerecorded)', level: 'AAA', since: '2.0', id: 'sign-language-prerecorded' },
  { sc: '1.2.7', title: 'Extended Audio Description (Prerecorded)', level: 'AAA', since: '2.0', id: 'extended-audio-description-prerecorded' },
  { sc: '1.2.8', title: 'Media Alternative (Prerecorded)', level: 'AAA', since: '2.0', id: 'media-alternative-prerecorded' },
  { sc: '1.2.9', title: 'Audio-only (Live)', level: 'AAA', since: '2.0', id: 'audio-only-live' },
  { sc: '1.3.1', title: 'Info and Relationships', level: 'A', since: '2.0', id: 'info-and-relationships' },
  { sc: '1.3.2', title: 'Meaningful Sequence', level: 'A', since: '2.0', id: 'meaningful-sequence' },
  { sc: '1.3.3', title: 'Sensory Characteristics', level: 'A', since: '2.0', id: 'sensory-characteristics' },
  { sc: '1.3.4', title: 'Orientation', level: 'AA', since: '2.1', id: 'orientation' },
  { sc: '1.3.5', title: 'Identify Input Purpose', level: 'AA', since: '2.1', id: 'identify-input-purpose' },
  { sc: '1.3.6', title: 'Identify Purpose', level: 'AAA', since: '2.1', id: 'identify-purpose' },
  { sc: '1.4.1', title: 'Use of Color', level: 'A', since: '2.0', id: 'use-of-color' },
  { sc: '1.4.2', title: 'Audio Control', level: 'A', since: '2.0', id: 'audio-control' },
  { sc: '1.4.3', title: 'Contrast (Minimum)', level: 'AA', since: '2.0', id: 'contrast-minimum' },
  { sc: '1.4.4', title: 'Resize Text', level: 'AA', since: '2.0', id: 'resize-text' },
  { sc: '1.4.5', title: 'Images of Text', level: 'AA', since: '2.0', id: 'images-of-text' },
  { sc: '1.4.6', title: 'Contrast (Enhanced)', level: 'AAA', since: '2.0', id: 'contrast-enhanced' },
  { sc: '1.4.7', title: 'Low or No Background Audio', level: 'AAA', since: '2.0', id: 'low-or-no-background-audio' },
  { sc: '1.4.8', title: 'Visual Presentation', level: 'AAA', since: '2.0', id: 'visual-presentation' },
  { sc: '1.4.9', title: 'Images of Text (No Exception)', level: 'AAA', since: '2.0', id: 'images-of-text-no-exception' },
  { sc: '1.4.10', title: 'Reflow', level: 'AA', since: '2.1', id: 'reflow' },
  { sc: '1.4.11', title: 'Non-text Contrast', level: 'AA', since: '2.1', id: 'non-text-contrast' },
  { sc: '1.4.12', title: 'Text Spacing', level: 'AA', since: '2.1', id: 'text-spacing' },
  { sc: '1.4.13', title: 'Content on Hover or Focus', level: 'AA', since: '2.1', id: 'content-on-hover-or-focus' },
  { sc: '2.1.1', title: 'Keyboard', level: 'A', since: '2.0', id: 'keyboard' },
  { sc: '2.1.2', title: 'No Keyboard Trap', level: 'A', since: '2.0', id: 'no-keyboard-trap' },
  { sc: '2.1.3', title: 'Keyboard (No Exception)', level: 'AAA', since: '2.0', id: 'keyboard-no-exception' },
  { sc: '2.1.4', title: 'Character Key Shortcuts', level: 'A', since: '2.1', id: 'character-key-shortcuts' },
  { sc: '2.2.1', title: 'Timing Adjustable', level: 'A', since: '2.0', id: 'timing-adjustable' },
  { sc: '2.2.2', title: 'Pause, Stop, Hide', level: 'A', since: '2.0', id: 'pause-stop-hide' },
  { sc: '2.2.3', title: 'No Timing', level: 'AAA', since: '2.0', id: 'no-timing' },
  { sc: '2.2.4', title: 'Interruptions', level: 'AAA', since: '2.0', id: 'interruptions' },
  { sc: '2.2.5', title: 'Re-authenticating', level: 'AAA', since: '2.0', id: 're-authenticating' },
  { sc: '2.2.6', title: 'Timeouts', level: 'AAA', since: '2.1', id: 'timeouts' },
  { sc: '2.3.1', title: 'Three Flashes or Below Threshold', level: 'A', since: '2.0', id: 'three-flashes-or-below-threshold' },
  { sc: '2.3.2', title: 'Three Flashes', level: 'AAA', since: '2.0', id: 'three-flashes' },
  { sc: '2.3.3', title: 'Animation from Interactions', level: 'AAA', since: '2.1', id: 'animation-from-interactions' },
  { sc: '2.4.1', title: 'Bypass Blocks', level: 'A', since: '2.0', id: 'bypass-blocks' },
  { sc: '2.4.2', title: 'Page Titled', level: 'A', since: '2.0', id: 'page-titled' },
  { sc: '2.4.3', title: 'Focus Order', level: 'A', since: '2.0', id: 'focus-order' },
  { sc: '2.4.4', title: 'Link Purpose (In Context)', level: 'A', since: '2.0', id: 'link-purpose-in-context' },
  { sc: '2.4.5', title: 'Multiple Ways', level: 'AA', since: '2.0', id: 'multiple-ways' },
  { sc: '2.4.6', title: 'Headings and Labels', level: 'AA', since: '2.0', id: 'headings-and-labels' },
  { sc: '2.4.7', title: 'Focus Visible', level: 'AA', since: '2.0', id: 'focus-visible' },
  { sc: '2.4.8', title: 'Location', level: 'AAA', since: '2.0', id: 'location' },
  { sc: '2.4.9', title: 'Link Purpose (Link Only)', level: 'AAA', since: '2.0', id: 'link-purpose-link-only' },
  { sc: '2.4.10', title: 'Section Headings', level: 'AAA', since: '2.0', id: 'section-headings' },
  { sc: '2.5.1', title: 'Pointer Gestures', level: 'A', since: '2.1', id: 'pointer-gestures' },
  { sc: '2.5.2', title: 'Pointer Cancellation', level: 'A', since: '2.1', id: 'pointer-cancellation' },
  { sc: '2.5.3', title: 'Label in Name', level: 'A', since: '2.1', id: 'label-in-name' },
  { sc: '2.5.4', title: 'Motion Actuation', level: 'A', since: '2.1', id: 'motion-actuation' },
  { sc: '2.5.5', title: 'Target Size', level: 'AAA', since: '2.1', id: 'target-size' },
  { sc: '2.5.6', title: 'Concurrent Input Mechanisms', level: 'AAA', since: '2.1', id: 'concurrent-input-mechanisms' },
  { sc: '3.1.1', title: 'Language of Page', level: 'A', since: '2.0', id: 'language-of-page' },
  { sc: '3.1.2', title: 'Language of Parts', level: 'AA', since: '2.0', id: 'language-of-parts' },
  { sc: '3.1.3', title: 'Unusual Words', level: 'AAA', since: '2.0', id: 'unusual-words' },
  { sc: '3.1.4', title: 'Abbreviations', level: 'AAA', since: '2.0', id: 'abbreviations' },
  { sc: '3.1.5', title: 'Reading Level', level: 'AAA', since: '2.0', id: 'reading-level' },
  { sc: '3.1.6', title: 'Pronunciation', level: 'AAA', since: '2.0', id: 'pronunciation' },
  { sc: '3.2.1', title: 'On Focus', level: 'A', since: '2.0', id: 'on-focus' },
  { sc: '3.2.2', title: 'On Input', level: 'A', since: '2.0', id: 'on-input' },
  { sc: '3.2.3', title: 'Consistent Navigation', level: 'AA', since: '2.0', id: 'consistent-navigation' },
  { sc: '3.2.4', title: 'Consistent Identification', level: 'AA', since: '2.0', id: 'consistent-identification' },
  { sc: '3.2.5', title: 'Change on Request', level: 'AAA', since: '2.0', id: 'change-on-request' },
  { sc: '3.3.1', title: 'Error Identification', level: 'A', since: '2.0', id: 'error-identification' },
  { sc: '3.3.2', title: 'Labels or Instructions', level: 'A', since: '2.0', id: 'labels-or-instructions' },
  { sc: '3.3.3', title: 'Error Suggestion', level: 'AA', since: '2.0', id: 'error-suggestion' },
  { sc: '3.3.4', title: 'Error Prevention (Legal, Financial, Data)', level: 'AA', since: '2.0', id: 'error-prevention-legal-financial-data' },
  { sc: '3.3.5', title: 'Help', level: 'AAA', since: '2.0', id: 'help' },
  { sc: '3.3.6', title: 'Error Prevention (All)', level: 'AAA', since: '2.0', id: 'error-prevention-all' },
  { sc: '4.1.1', title: 'Parsing', level: 'A', since: '2.0', id: 'parsing' },
  { sc: '4.1.2', title: 'Name, Role, Value', level: 'A', since: '2.0', id: 'name-role-value' },
  { sc: '4.1.3', title: 'Status Messages', level: 'AA', since: '2.1', id: 'status-messages' },
];

/** Level A and AA success criteria added in WCAG 2.2. */
export const WCAG22_ADDED_A_AA: readonly WcagCriterion[] = [
  { sc: '2.4.11', title: 'Focus Not Obscured (Minimum)', level: 'AA', since: '2.2', id: 'focus-not-obscured-minimum' },
  { sc: '2.5.7', title: 'Dragging Movements', level: 'AA', since: '2.2', id: 'dragging-movements' },
  { sc: '2.5.8', title: 'Target Size (Minimum)', level: 'AA', since: '2.2', id: 'target-size-minimum' },
  { sc: '3.2.6', title: 'Consistent Help', level: 'A', since: '2.2', id: 'consistent-help' },
  { sc: '3.3.7', title: 'Redundant Entry', level: 'A', since: '2.2', id: 'redundant-entry' },
  { sc: '3.3.8', title: 'Accessible Authentication (Minimum)', level: 'AA', since: '2.2', id: 'accessible-authentication-minimum' },
];
