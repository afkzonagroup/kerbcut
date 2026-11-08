import { writeFile } from 'node:fs/promises';
import { renderHtmlReport, renderJsonReport, scan, type ScanOptions } from '@afkzona/kerbcut';

// Scan up to 10 pages of a site and write both reports.
export async function scanSite(startUrl: string, outDir: string, extra: Partial<ScanOptions> = {}) {
  const report = await scan({ startUrl, limits: { maxPages: 10, maxDepth: 2 }, ...extra });
  await writeFile(`${outDir}/report.json`, renderJsonReport(report));
  await writeFile(`${outDir}/report.html`, renderHtmlReport(report));
  for (const c of report.summary.byCriterion) {
    console.log(`WCAG ${c.sc} / EN 301 549 ${c.en301549 ?? '-'}: ${c.nodes} elements on ${c.pages} pages`);
  }
  return report.summary.violations;
}
