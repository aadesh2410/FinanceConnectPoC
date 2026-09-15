import { AnalyzedSheet } from './region-detector'

export function extractSampleRows(sheet: AnalyzedSheet, maxRows = 8): string[][] {
  const hRow = sheet.headerRow
  if (hRow === null) return []

  const headerCells = sheet.cells.filter((c) => c.row === hRow).sort((a, b) => a.col - b.col)
  if (headerCells.length === 0) return []

  const colIndices = headerCells.map((c) => c.col)
  const headers = headerCells.map((c) => String(c.value ?? '').trim())

  const dataRowNums = Array.from(
    new Set(sheet.cells.filter((c) => c.row > hRow).map((c) => c.row))
  )
    .sort((a, b) => a - b)
    .slice(0, maxRows)

  const rows: string[][] = [headers]
  for (const rowNum of dataRowNums) {
    const rowCells = sheet.cells.filter((c) => c.row === rowNum)
    const row = colIndices.map((col) => {
      const cell = rowCells.find((c) => c.col === col)
      return cell && cell.value !== null ? String(cell.value) : ''
    })
    rows.push(row)
  }
  return rows
}

export function extractAllRows(sheet: AnalyzedSheet): Array<Record<string, string>> {
  const hRow = sheet.headerRow
  if (hRow === null) return []

  const headerCells = sheet.cells.filter((c) => c.row === hRow).sort((a, b) => a.col - b.col)
  if (headerCells.length === 0) return []

  const colIndices = headerCells.map((c) => c.col)
  const headers = headerCells.map((c) => String(c.value ?? '').trim())

  const dataRowNums = Array.from(
    new Set(sheet.cells.filter((c) => c.row > hRow).map((c) => c.row))
  ).sort((a, b) => a - b)

  return dataRowNums.map((rowNum) => {
    const rowCells = sheet.cells.filter((c) => c.row === rowNum)
    const record: Record<string, string> = {}
    colIndices.forEach((col, i) => {
      const cell = rowCells.find((c) => c.col === col)
      record[headers[i]] = cell && cell.value !== null ? String(cell.value) : ''
    })
    return record
  })
}
