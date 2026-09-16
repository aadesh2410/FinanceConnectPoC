import { AnalyzedSheet } from './region-detector'
import { indexToColLetter } from './sample-extractor'
import { PivotConfig } from '@/lib/schema/types'

function colLetterToIndex(letter: string): number {
  let result = 0
  for (let i = 0; i < letter.length; i++) {
    result = result * 26 + (letter.charCodeAt(i) - 64)
  }
  return result
}

function getCellValue(sheet: AnalyzedSheet, row: number, colLetter: string): string {
  const colIdx = colLetterToIndex(colLetter.toUpperCase())
  const cell = sheet.cells.find((c) => c.row === row && c.col === colIdx)
  return cell && cell.value !== null && cell.value !== undefined ? String(cell.value).trim() : ''
}

export function extractPivotRows(
  sheet: AnalyzedSheet,
  pivotConfig: PivotConfig
): Array<Record<string, string>> {
  const {
    dimensionColumnName,
    headerRow,
    hierarchySourceCols,
    hierarchyColumnNames,
    valueColumnName,
    dataStartRow,
    dataEndRow,
    pivotStartCol,
    pivotEndCol,
    excludePatterns,
  } = pivotConfig

  const pivotStartIdx = colLetterToIndex(pivotStartCol.toUpperCase())
  const pivotEndIdx = colLetterToIndex(pivotEndCol.toUpperCase())

  // Build map of pivot col index → dimension value from header row
  const dimensionValues: Map<number, string> = new Map()
  for (let colIdx = pivotStartIdx; colIdx <= pivotEndIdx; colIdx++) {
    const cell = sheet.cells.find((c) => c.row === headerRow && c.col === colIdx)
    const val = cell && cell.value !== null && cell.value !== undefined ? String(cell.value).trim() : ''
    if (val) dimensionValues.set(colIdx, val)
  }

  const excludeRegexes = excludePatterns.map((p) => new RegExp(p, 'i'))

  const results: Array<Record<string, string>> = []

  for (let rowNum = dataStartRow; rowNum <= dataEndRow; rowNum++) {
    // Read hierarchy values
    const hierarchyValues: string[] = hierarchySourceCols.map((col) =>
      getCellValue(sheet, rowNum, col)
    )

    // Skip rows where ALL hierarchy values are blank
    if (hierarchyValues.every((v) => v === '')) continue

    // Skip rows matching exclude patterns (any hierarchy value)
    const shouldExclude = hierarchyValues.some((v) =>
      excludeRegexes.some((re) => re.test(v))
    )
    if (shouldExclude) continue

    // For each pivot column emit one flat record
    for (const [colIdx, dimensionValue] of Array.from(dimensionValues.entries())) {
      const cellValue = (() => {
        const cell = sheet.cells.find((c) => c.row === rowNum && c.col === colIdx)
        return cell && cell.value !== null && cell.value !== undefined ? String(cell.value).trim() : ''
      })()

      const record: Record<string, string> = {
        [dimensionColumnName]: dimensionValue,
      }

      hierarchySourceCols.forEach((_, i) => {
        record[hierarchyColumnNames[i]] = hierarchyValues[i]
      })

      record[valueColumnName] = cellValue
      results.push(record)
    }
  }

  return results
}

export function extractPivotSampleRows(
  sheet: AnalyzedSheet,
  pivotConfig: PivotConfig,
  maxRows = 8
): string[][] {
  const { dimensionColumnName, hierarchyColumnNames, valueColumnName } = pivotConfig
  const headers = [dimensionColumnName, ...hierarchyColumnNames, valueColumnName]

  const allRows = extractPivotRows(sheet, pivotConfig)
  const sample = allRows.slice(0, maxRows)

  const rows: string[][] = [headers]
  for (const record of sample) {
    rows.push(headers.map((h) => record[h] ?? ''))
  }
  return rows
}
