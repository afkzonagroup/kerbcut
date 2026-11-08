// Copyright 2026 MB AFKzona Group
// SPDX-License-Identifier: AGPL-3.0-only
//
// The part of a scan report that the document generators use. Report files
// read from disk are untrusted input and are validated against this shape.
import { arr, int, obj, oneOf, str, type Infer } from '../config/v.js';

/** Validator for the scan evidence part of a report file. Other fields are ignored. */
export const scanEvidenceValidator = obj(
  {
    schemaVersion: str({ max: 20, pattern: /^1\.\d+\.\d+$/ }),
    tool: obj({ name: str({ max: 50 }), version: str({ max: 50 }), axeCoreVersion: str({ max: 50 }) }, { strict: false }),
    scan: obj({ startedAt: str({ max: 40, pattern: /^\d{4}-\d{2}-\d{2}T[\d:.]+Z$/ }) }, { strict: false }),
    standards: obj({ wcag: oneOf(['2.1', '2.2'] as const), en301549Version: oneOf(['V3.2.1', 'V4.1.1'] as const) }, { strict: false }),
    summary: obj(
      {
        pagesScanned: int({ min: 0, max: 1_000_000 }),
        violations: obj({ findings: int({ min: 0, max: 100_000_000 }), nodes: int({ min: 0, max: 100_000_000 }) }),
        byCriterion: arr(
          obj({ sc: str({ max: 10, pattern: /^\d\.\d{1,2}\.\d{1,2}$/ }), nodes: int({ min: 0, max: 100_000_000 }), pages: int({ min: 0, max: 1_000_000 }) }, { strict: false }),
          { max: 200 },
        ),
      },
      { strict: false },
    ),
  },
  { strict: false },
);

/** Scan evidence used by the generators. A full ScanReport satisfies it. */
export type ScanEvidence = Infer<typeof scanEvidenceValidator>;

/** Validates untrusted report JSON. Throws ValidationError. */
export function parseScanEvidence(input: unknown): ScanEvidence {
  return scanEvidenceValidator(input, '');
}
