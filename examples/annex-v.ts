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
