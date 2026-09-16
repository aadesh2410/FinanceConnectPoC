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

type RowType = 'DATA' | 'SUBTOTAL' | 'GRAND_TOTAL' | 'SECTION_HEADER'

function classifyRow(hierarchyValues: string[], totalPatterns: RegExp[], sectionHeaderPatterns: RegExp[]): RowType {
  const combined = hierarchyValues.join(' ')
  if (sectionHeaderPatterns.length > 0 && sectionHeaderPatterns.some((re) => re.test(combined))) {
    return 'SECTION_HEADER'
  }
  if (totalPatterns.length > 0) {
    if (/grand\s*total/i.test(combined)) return 'GRAND_TOTAL'
    if (totalPatterns.some((re) => re.test(combined))) return 'SUBTOTAL'
  }
  return 'DATA'
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
    carryForwardHierarchyCols,
    valueColumnName,
    dataStartRow,
    dataEndRow,
    pivotStartCol,
    pivotEndCol,
    excludePatterns,
    totalPatterns,
    sectionHeaderPatterns,
    rowTypeColumnName,
    isTotalColumnName,
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
  const totalRegexes = (totalPatterns ?? []).map((p) => new RegExp(p, 'i'))
  const sectionHeaderRegexes = (sectionHeaderPatterns ?? []).map((p) => new RegExp(p, 'i'))

  // Carry-forward state: last seen non-empty value per hierarchy column
  const lastSeen: string[] = hierarchySourceCols.map(() => '')

  const results: Array<Record<string, string>> = []

  for (let rowNum = dataStartRow; rowNum <= dataEndRow; rowNum++) {
    // Read raw hierarchy values from cells
    const rawValues: string[] = hierarchySourceCols.map((col) =>
      getCellValue(sheet, rowNum, col)
    )

    // Apply carry-forward for merged-cell columns
    const hierarchyValues: string[] = rawValues.map((val, i) => {
      const shouldCarry = carryForwardHierarchyCols?.[i] ?? false
      if (val !== '') {
        lastSeen[i] = val
        return val
      }
      return shouldCarry ? lastSeen[i] : ''
    })

    // Skip rows where ALL (even after carry-forward) hierarchy values are blank
    if (hierarchyValues.every((v) => v === '')) continue

    // Skip rows matching exclude patterns
    if (hierarchyValues.some((v) => excludeRegexes.some((re) => re.test(v)))) continue

    const rowType = classifyRow(hierarchyValues, totalRegexes, sectionHeaderRegexes)

    // Section-header rows have no data values — skip if no pivot values exist
    if (rowType === 'SECTION_HEADER') {
      const hasAnyValue = Array.from(dimensionValues.keys()).some((colIdx) => {
        const cell = sheet.cells.find((c) => c.row === rowNum && c.col === colIdx)
        return cell && cell.value !== null && cell.value !== undefined && String(cell.value).trim() !== ''
      })
      if (!hasAnyValue) continue
    }

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

      if (rowTypeColumnName) record[rowTypeColumnName] = rowType
      if (isTotalColumnName) record[isTotalColumnName] = (rowType === 'SUBTOTAL' || rowType === 'GRAND_TOTAL') ? 'true' : 'false'

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
  const { dimensionColumnName, hierarchyColumnNames, valueColumnName, rowTypeColumnName, isTotalColumnName } = pivotConfig
  const headers = [dimensionColumnName, ...hierarchyColumnNames, valueColumnName]
  if (rowTypeColumnName) headers.push(rowTypeColumnName)
  if (isTotalColumnName) headers.push(isTotalColumnName)

  const allRows = extractPivotRows(sheet, pivotConfig)
  const sample = allRows.slice(0, maxRows)

  const rows: string[][] = [headers]
  for (const record of sample) {
    rows.push(headers.map((h) => record[h] ?? ''))
  }
  return rows
}
