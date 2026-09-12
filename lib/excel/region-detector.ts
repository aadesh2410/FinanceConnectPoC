import { SheetData, CellData } from './parser'

export type RegionType = 'TITLE' | 'METADATA' | 'HEADER' | 'DATA' | 'TOTALS' | 'BLANK' | 'LOOKUP'

export interface DetectedRegion {
  type: RegionType
  startRow: number
  endRow: number
  startCol: number
  endCol: number
  confidence: number
}

export interface AnalyzedSheet extends SheetData {
  regions: DetectedRegion[]
  primaryDataRegion: DetectedRegion | null
  headerRow: number | null
  headerRows: number[]
}

function getRowCells(cells: CellData[], row: number): CellData[] {
  return cells.filter((c) => c.row === row).sort((a, b) => a.col - b.col)
}

function isNumericDominant(rowCells: CellData[]): boolean {
  if (rowCells.length === 0) return false
  const numeric = rowCells.filter((c) => c.type === 'number' || c.type === 'formula').length
  return numeric / rowCells.length > 0.6
}

function isStringDominant(rowCells: CellData[]): boolean {
  if (rowCells.length === 0) return false
  const strings = rowCells.filter((c) => c.type === 'string').length
  return strings / rowCells.length > 0.6
}

export function analyzeSheet(sheet: SheetData): AnalyzedSheet {
  const regions: DetectedRegion[] = []

  const allRows = Array.from(new Set(sheet.cells.map((c) => c.row))).sort((a, b) => a - b)
  if (allRows.length === 0) {
    return { ...sheet, regions: [], primaryDataRegion: null, headerRow: null, headerRows: [] }
  }

  const minCol = Math.min(...sheet.cells.map((c) => c.col))
  const maxCol = Math.max(...sheet.cells.map((c) => c.col))

  // Find title: first 1-3 rows that are string-dominant with few columns or merged
  let titleEndRow = 0
  for (const row of allRows.slice(0, 5)) {
    const rowCells = getRowCells(sheet.cells, row)
    const isMerged = sheet.mergedCells.some((m) => m.top === row && m.bottom === row && (m.right - m.left) > 2)
    const isSingleWideString = rowCells.length <= 2 && rowCells.every((c) => c.type === 'string')
    if ((isMerged || isSingleWideString) && row <= 5) {
      regions.push({ type: 'TITLE', startRow: row, endRow: row, startCol: minCol, endCol: maxCol, confidence: 0.85 })
      titleEndRow = row
    } else {
      break
    }
  }

  // Find metadata: key-value pairs after title
  let metaEndRow = titleEndRow
  for (const row of allRows.filter((r) => r > titleEndRow && r <= titleEndRow + 6)) {
    const rowCells = getRowCells(sheet.cells, row)
    if (rowCells.length === 2 && rowCells[0].type === 'string') {
      regions.push({ type: 'METADATA', startRow: row, endRow: row, startCol: minCol, endCol: maxCol, confidence: 0.8 })
      metaEndRow = row
    }
  }

  // Find data region: look for consistent column count runs
  const dataStartCandidates = allRows.filter((r) => r > metaEndRow + 1)

  let headerRow: number | null = null
  let dataStartRow: number | null = null
  let dataEndRow: number | null = null

  for (let i = 0; i < dataStartCandidates.length - 1; i++) {
    const row = dataStartCandidates[i]
    const rowCells = getRowCells(sheet.cells, row)
    const nextRow = dataStartCandidates[i + 1]
    const nextRowCells = getRowCells(sheet.cells, nextRow)

    if (isStringDominant(rowCells) && isNumericDominant(nextRowCells) && rowCells.length >= 3) {
      headerRow = row
      dataStartRow = nextRow
      break
    }
  }

  if (dataStartRow !== null) {
    // Find where data ends (blank row or totals)
    const dataRows = allRows.filter((r) => r >= dataStartRow!)
    let lastDataRow = dataStartRow
    for (const row of dataRows) {
      const rowCells = getRowCells(sheet.cells, row)
      if (rowCells.length === 0) break
      lastDataRow = row
    }
    dataEndRow = lastDataRow

    if (headerRow !== null) {
      regions.push({
        type: 'HEADER',
        startRow: headerRow,
        endRow: headerRow,
        startCol: minCol,
        endCol: maxCol,
        confidence: 0.9,
      })
    }

    const dataRegion: DetectedRegion = {
      type: 'DATA',
      startRow: dataStartRow,
      endRow: dataEndRow,
      startCol: minCol,
      endCol: maxCol,
      confidence: 0.88,
    }
    regions.push(dataRegion)

    // Detect multi-level headers: look for additional string-dominant rows immediately before headerRow
    const headerRows: number[] = []
    if (headerRow !== null) {
      const precedingRows = allRows.filter((r) => r < headerRow && r >= headerRow - 3).reverse()
      for (const r of precedingRows) {
        const rc = getRowCells(sheet.cells, r)
        if (isStringDominant(rc) && rc.length >= 3) headerRows.unshift(r)
        else break
      }
      headerRows.push(headerRow)
    }

    return { ...sheet, regions, primaryDataRegion: dataRegion, headerRow, headerRows }
  }

  // Fallback: treat all non-title/meta rows as data
  const remainingRows = allRows.filter((r) => r > metaEndRow)
  if (remainingRows.length > 0) {
    const fallbackRegion: DetectedRegion = {
      type: 'DATA',
      startRow: remainingRows[0],
      endRow: remainingRows[remainingRows.length - 1],
      startCol: minCol,
      endCol: maxCol,
      confidence: 0.5,
    }
    regions.push(fallbackRegion)
    return { ...sheet, regions, primaryDataRegion: fallbackRegion, headerRow: null, headerRows: [] }
  }

  return { ...sheet, regions, primaryDataRegion: null, headerRow: null, headerRows: [] }
}
