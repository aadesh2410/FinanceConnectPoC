import { AnalyzedSheet } from './region-detector'

function parseRange(range: string): { startRow: number; endRow: number; startCol: number; endCol: number } | null {
  const match = range.match(/^([A-Z]+)(\d+):([A-Z]+)(\d+)$/i)
  if (!match) return null
  return {
    startRow: parseInt(match[2]),
    endRow: parseInt(match[4]),
    startCol: colLetterToIndex(match[1].toUpperCase()),
    endCol: colLetterToIndex(match[3].toUpperCase()),
  }
}

function colLetterToIndex(letter: string): number {
  let result = 0
  for (let i = 0; i < letter.length; i++) {
    result = result * 26 + (letter.charCodeAt(i) - 64)
  }
  return result
}

export function indexToColLetter(index: number): string {
  let result = ''
  let n = index
  while (n > 0) {
    const rem = (n - 1) % 26
    result = String.fromCharCode(65 + rem) + result
    n = Math.floor((n - 1) / 26)
  }
  return result
}

function resolveHeaderRow(sheet: AnalyzedSheet, sourceRange?: string): number | null {
  if (sourceRange) {
    const parsed = parseRange(sourceRange)
    if (parsed && parsed.startRow > 1) {
      const candidateRow = parsed.startRow - 1
      const cells = sheet.cells.filter((c) => c.row === candidateRow)
      if (cells.length > 0) return candidateRow
      const candidateRow2 = parsed.startRow - 2
      const cells2 = sheet.cells.filter((c) => c.row === candidateRow2)
      if (cells2.length > 0) return candidateRow2
    }
  }
  return sheet.headerRow
}

/**
 * Build colIndices covering every column in the range (or the header row's populated columns).
 * Empty header cells get a fallback label of their column letter.
 */
function buildColumns(
  sheet: AnalyzedSheet,
  hRow: number,
  sourceRange?: string
): { colIndices: number[]; headers: string[] } {
  const parsed = sourceRange ? parseRange(sourceRange) : null

  if (parsed) {
    // Use the full column span from the source range
    const colIndices: number[] = []
    for (let col = parsed.startCol; col <= parsed.endCol; col++) {
      colIndices.push(col)
    }
    const headerCellsMap = new Map(
      sheet.cells.filter((c) => c.row === hRow).map((c) => [c.col, c])
    )
    const headers = colIndices.map((col) => {
      const cell = headerCellsMap.get(col)
      return cell && cell.value !== null ? String(cell.value).trim() : indexToColLetter(col)
    })
    return { colIndices, headers }
  }

  // Fallback: use whatever header cells exist
  const headerCells = sheet.cells.filter((c) => c.row === hRow).sort((a, b) => a.col - b.col)
  return {
    colIndices: headerCells.map((c) => c.col),
    headers: headerCells.map((c) => String(c.value ?? '').trim()),
  }
}

export function extractSampleRows(sheet: AnalyzedSheet, sourceRange?: string, maxRows = 8): string[][] {
  const hRow = resolveHeaderRow(sheet, sourceRange)
  if (hRow === null) return []

  const { colIndices, headers } = buildColumns(sheet, hRow, sourceRange)
  if (colIndices.length === 0) return []

  const parsed = sourceRange ? parseRange(sourceRange) : null
  const allDataRows = Array.from(
    new Set(sheet.cells.filter((c) => c.row > hRow).map((c) => c.row))
  ).sort((a, b) => a - b)

  const dataRowNums = parsed
    ? allDataRows.filter((r) => r >= parsed.startRow && r <= parsed.endRow).slice(0, maxRows)
    : allDataRows.slice(0, maxRows)

  const rows: string[][] = [headers]
  for (const rowNum of dataRowNums) {
    const rowCellsMap = new Map(
      sheet.cells.filter((c) => c.row === rowNum).map((c) => [c.col, c])
    )
    const row = colIndices.map((col) => {
      const cell = rowCellsMap.get(col)
      return cell && cell.value !== null ? String(cell.value) : ''
    })
    rows.push(row)
  }
  return rows
}

export function extractAllRows(sheet: AnalyzedSheet, sourceRange?: string): Array<Record<string, string>> {
  const hRow = resolveHeaderRow(sheet, sourceRange)
  if (hRow === null) return []

  const { colIndices } = buildColumns(sheet, hRow, sourceRange)
  if (colIndices.length === 0) return []

  const parsed = sourceRange ? parseRange(sourceRange) : null
  const allDataRows = Array.from(
    new Set(sheet.cells.filter((c) => c.row > hRow).map((c) => c.row))
  ).sort((a, b) => a - b)

  const dataRowNums = parsed
    ? allDataRows.filter((r) => r >= parsed.startRow && r <= parsed.endRow)
    : allDataRows

  return dataRowNums.map((rowNum) => {
    const rowCellsMap = new Map(
      sheet.cells.filter((c) => c.row === rowNum).map((c) => [c.col, c])
    )
    const record: Record<string, string> = {}
    colIndices.forEach((col) => {
      const cell = rowCellsMap.get(col)
      // Key by column letter to match ColumnSchema.sourceColumn
      record[indexToColLetter(col)] = cell && cell.value !== null ? String(cell.value) : ''
    })
    return record
  })
}
