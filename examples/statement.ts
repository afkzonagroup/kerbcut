import { generateStatement, listStatementChoices, parseStatementConfig } from '@afkzona/kerbcut';

// Public sector accessibility statement from the model in
// Commission Implementing Decision (EU) 2018/1523 (Directive (EU) 2016/2102).
export function statementExample() {
  // The model has grammatical alternatives such as "[This] [These]".
  // listStatementChoices() shows them; word them in "choices".
  console.log(listStatementChoices('en', 'partial'));
  const config = parseStatementConfig({
    language: 'en',
    bodyName: 'Example City Council',
    legislation: 'the national act transposing Directive (EU) 2016/2102',
    scope: 'the website https://city.example/',
    standard: 'EN 301 549 V3.2.1 (2021-03)',
    status: 'partial',
    nonCompliances: ['Some images have no text alternative.'],
    preparedOn: '2026-11-08',
    method: 'Self-assessment.',
    feedback: 'Write to us.',
    contact: 'accessibility@city.example',
    enforcement: 'You can complain to the ombudsman.',
    enforcementContact: 'ombudsman.example',
    choices: { 'intro.1': 'website', 'status.1': 'This website is', 'status.2': 'the non-compliances' },
  });
  const out = generateStatement(config);
  return { markdown: out.markdown, unresolved: out.unresolvedChoices };
}
