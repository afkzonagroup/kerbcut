// Copyright 2026 MB AFKzona Group
// SPDX-License-Identifier: AGPL-3.0-only
//
// Official sources used to build the legal text data in src/data/.
// All URLs point to EUR-Lex, the official website of EU law.

/** The 24 official EU languages, EUR-Lex language codes. */
export const EU_LANGUAGES = [
  'BG', 'ES', 'CS', 'DA', 'DE', 'ET', 'EL', 'EN', 'FR', 'GA', 'HR', 'IT',
  'LV', 'LT', 'HU', 'MT', 'NL', 'PL', 'PT', 'RO', 'SK', 'SL', 'FI', 'SV',
];

export const SOURCES = {
  eaa: {
    celex: '32019L0882',
    eli: 'http://data.europa.eu/eli/dir/2019/882/oj',
    /** @param {string} lang */
    url: (lang) => `https://eur-lex.europa.eu/legal-content/${lang}/TXT/HTML/?uri=CELEX:32019L0882`,
  },
  modelStatement: {
    celex: '32018D1523',
    eli: 'http://data.europa.eu/eli/dec_impl/2018/1523/oj',
    /** @param {string} lang */
    url: (lang) => `https://eur-lex.europa.eu/legal-content/${lang}/TXT/HTML/?uri=CELEX:32018D1523`,
  },
};

/**
 * Corrigenda to Directive (EU) 2019/882 that change text this project uses.
 * Checked on EUR-Lex on 2026-11-08: R(01) DE (recital 47), R(02) ET (Annex I
 * Section I), R(03) FI (Article 2), R(04) FR (recitals, Articles, Annex I
 * Sections II, IV(c), V) do not touch Annex I Section III, Section IV(g) or
 * Annex V. R(05) HR corrects Annex I Section III point (d).
 */
export const EAA_CORRIGENDA = [
  {
    celex: '32019L0882R(05)',
    eli: 'http://data.europa.eu/eli/dir/2019/882/corrigendum/2026-10-29/oj',
    lang: 'HR',
    key: 'annexI.III.d',
    from: 'ako su raspoložive, uslugama potpore (službe za pomoć korisnicima, pozivni centri, tehnička podrška, usluge posredovanja i usluge osposobljavanja) kojima se pristupačnim načinima komunikacije pružaju informacije o pristupačnosti proizvoda i njegovoj kompatibilnosti s pomoćnim tehnologijama.',
    to: 'ako su raspoložive, uslugama potpore (službe za pomoć korisnicima, pozivni centri, tehnička podrška, usluge posredovanja i usluge osposobljavanja) kojima se pristupačnim načinima komunikacije pružaju informacije o pristupačnosti usluge i njezinoj kompatibilnosti s pomoćnim tehnologijama.',
  },
];
