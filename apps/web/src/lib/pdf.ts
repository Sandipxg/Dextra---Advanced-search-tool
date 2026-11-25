import type { ReportResult, RunSummary } from './api'

const GROUP_NAMES: Record<ReportResult['group'], string> = {
  main: 'Result',
  outside: 'Outside scope',
  unverified: 'Unverified',
}

/**
 * jsPDF's built-in fonts only cover Latin-1, so other characters (e.g. Hindi, emoji) are
 * replaced instead of printing as garbage. Titles/snippets come from arbitrary pages.
 */
export const toPdfText = (text: string): string =>
  text
    .normalize('NFKC')
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/[–—]/g, '-')
    .replace(/…/g, '...')
    .replace(/[^ -~ -ÿ]/g, '?')

/**
 * Builds the results PDF in the browser (F5) and starts the download. jsPDF is loaded only
 * when someone asks for a PDF, so it stays out of the main bundle.
 */
export const downloadResultsPdf = async (run: RunSummary, results: readonly ReportResult[]) => {
  const [{ jsPDF }, { autoTable }] = await Promise.all([import('jspdf'), import('jspdf-autotable')])
  const doc = new jsPDF({ orientation: 'landscape', unit: 'pt', format: 'a4' })
  const keywords = [...run.spec.keywords.all, ...run.spec.keywords.phrases].join(', ')

  doc.setFontSize(16)
  doc.text('Dextra search results', 40, 44)
  doc.setFontSize(10)
  const lines = [
    keywords ? `Keywords: ${keywords}` : '',
    run.spec.scope.domains.length ? `Domains: ${run.spec.scope.domains.join(', ')}` : '',
    run.spec.description ? `Description: ${run.spec.description}` : '',
    `Generated: ${new Date().toLocaleString()} · ${results.length} results`,
  ].filter(Boolean)
  lines.forEach((line, i) => {
    doc.text(toPdfText(line), 40, 64 + i * 14)
  })

  autoTable(doc, {
    startY: 64 + lines.length * 14 + 8,
    head: [['#', 'Group', 'Title', 'URL', 'Score']],
    body: results.map((r, i) => [
      String(i + 1),
      GROUP_NAMES[r.group],
      toPdfText(r.title),
      toPdfText(r.url),
      String(r.score),
    ]),
    styles: { fontSize: 8, cellPadding: 4, overflow: 'linebreak' },
    headStyles: { fillColor: [47, 91, 211] },
    columnStyles: {
      0: { cellWidth: 24 },
      1: { cellWidth: 70 },
      2: { cellWidth: 260 },
      4: { cellWidth: 40 },
    },
  })
  doc.save(`dextra-${run.id.slice(0, 8)}.pdf`)
}
