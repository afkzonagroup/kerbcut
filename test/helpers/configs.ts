// Copyright 2026 MB AFKzona Group
// SPDX-License-Identifier: AGPL-3.0-only

/** A valid Annex V configuration. */
export const annexVBase = {
  language: 'en',
  updatedOn: '2026-11-08',
  provider: { name: 'Example Shop UAB', address: 'Gedimino pr. 1, Vilnius', website: 'https://shop.example/' },
  service: {
    name: 'Example Shop online store',
    url: 'https://shop.example/',
    category: 'e-commerce',
    description: 'An online shop for household goods.',
    operation: 'Customers search, add products to a basket, pay by card or bank link, and receive e-mail confirmations.',
  },
  requirements: [
    { point: 'III.c', status: 'partially-met', explanation: 'Website tested against EN 301 549 clause 9; known issues are listed.' },
    { point: 'IV.g.iii', status: 'met', explanation: 'Payment pages work with keyboard and screen readers.' },
  ],
  standards: [{ reference: 'EN 301 549 V3.2.1 (2021-03)', scope: 'clause 9 (web)' }],
  conformityProcess: 'Every release is tested with automated and manual checks; accessibility feedback is handled within 5 working days.',
  contact: { email: 'access@shop.example', phone: '+370 600 00000' },
  authority: { name: 'Market surveillance authority', url: 'https://authority.example/' },
} as const;

/** A valid statement configuration. */
export const statementBase = {
  language: 'en',
  bodyName: 'Example City Council',
  legislation: 'the Act on the Accessibility of Public Sector Websites',
  scope: 'the website https://city.example/',
  standard: 'EN 301 549 V3.2.1 (2021-03)',
  status: 'partial',
  nonCompliances: ['Some images have no text alternative.'],
  preparedOn: '2026-11-08',
  method: 'Self-assessment with automated and manual testing.',
  feedback: 'Use the feedback form.',
  feedbackUrl: 'https://city.example/feedback',
  contact: 'accessibility@city.example',
  enforcement: 'If the answer is not satisfactory, contact the ombudsman.',
  enforcementUrl: 'https://ombudsman.example/',
  enforcementContact: 'Ombudsman, Main Street 1',
} as const;
