import { SchemaInferenceProvider, WorkbookAnalysis, InferSchemaResult } from './provider'
import { WorkbookSchema, ColumnSchema, SnowflakeDataType, TableType } from '@/lib/schema/types'
import { AnalyzedSheet, DetectedRegion } from '@/lib/excel/region-detector'
import { indexToColLetter } from '@/lib/excel/sample-extractor'
import { Skill } from '@/lib/skills/types'

function toSnakeCase(header: string): string {
  let result = header
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    || 'COLUMN'
  if (/^[0-9]/.test(result)) result = 'COL_' + result
  return result
}

function inferDataType(values: (string | number | boolean | null)[], cellTypes: string[]): SnowflakeDataType {
  const nonEmpty = values.filter((v) => v !== null && v !== '' && v !== undefined)
  if (nonEmpty.length === 0) return 'VARCHAR'

  const dateRe = /^\d{4}-\d{2}-\d{2}$|^\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4}$/
  const numRe = /^-?[\d,]+(\.\d+)?(%)?$/

  let numCount = 0
  let dateCount = 0
  let boolCount = 0
  let hasDecimals = false

  for (let i = 0; i < nonEmpty.length; i++) {
    const v = nonEmpty[i]
    const t = cellTypes[i]
    if (t === 'boolean' || v === true || v === false) { boolCount++; continue }
    if (t === 'date') { dateCount++; continue }
    const str = String(v)
    if (dateRe.test(str)) { dateCount++; continue }
    if (numRe.test(str)) {
      numCount++
      if (str.includes('.')) hasDecimals = true
      continue
    }
  }

  const total = nonEmpty.length
  if (boolCount / total > 0.8) return 'BOOLEAN'
  if (dateCount / total > 0.7) return 'DATE'
  if (numCount / total > 0.7) return hasDecimals ? 'NUMBER' : 'INTEGER'
  return 'VARCHAR'
}

function tableTypeFromSheet(sheet: AnalyzedSheet): TableType {
  const name = sheet.name.toLowerCase()
  if (/summary|concentration|aggregat|overview/.test(name)) return 'SUMMARY'
  if (/matrix|transition|crosstab|pivot/.test(name)) return 'CROSSTAB'
  if (/param|config|lookup|reference|master|ref/.test(name)) return 'LOOKUP'
  return 'TRANSACTIONAL'
}

function buildTableFromSheet(sheet: AnalyzedSheet, region: DetectedRegion, fileName: string): WorkbookSchema['tables'][number] | null {
  // Header row is one above the data region start
  const hRow = region.startRow - 1
  const headerCells = sheet.cells
    .filter((c) => c.row === hRow && c.col >= region.startCol && c.col <= region.endCol)
    .sort((a, b) => a.col - b.col)

  if (headerCells.length === 0) return null

  const dataRows = Array.from(
    new Set(sheet.cells.filter((c) => c.row >= region.startRow && c.row <= region.endRow).map((c) => c.row))
  ).sort((a, b) => a - b).slice(0, 20)

  const columns: ColumnSchema[] = []
  const usedNames = new Set<string>()

  for (let colIdx = region.startCol; colIdx <= region.endCol; colIdx++) {
    const headerCell = headerCells.find((c) => c.col === colIdx)
    const rawName = headerCell ? String(headerCell.value ?? '').trim() : ''
    let colName = rawName ? toSnakeCase(rawName) : indexToColLetter(colIdx)

    // Deduplicate column names
    let finalName = colName
    let suffix = 2
    while (usedNames.has(finalName)) { finalName = `${colName}_${suffix++}` }
    usedNames.add(finalName)

    const colCells = dataRows.map((r) => sheet.cells.find((c) => c.row === r && c.col === colIdx))
    const values = colCells.map((c) => c?.value ?? null)
    const types = colCells.map((c) => c?.type ?? 'empty')
    const nonEmpty = values.filter((v) => v !== null && v !== '')
    const populatedRatio = nonEmpty.length / Math.max(dataRows.length, 1)

    const dataType = inferDataType(values, types)
    const confidence = populatedRatio > 0.9 ? 0.92 : populatedRatio > 0.5 ? 0.78 : 0.62

    columns.push({
      name: finalName,
      sourceColumn: indexToColLetter(colIdx),
      sourceRange: `${indexToColLetter(colIdx)}${region.startRow}:${indexToColLetter(colIdx)}${region.endRow}`,
      dataType,
      nullable: populatedRatio < 1.0,
      confidence,
      evidence: [
        rawName ? `Header: "${rawName}"` : `Column ${indexToColLetter(colIdx)} (no header)`,
        `${Math.round(populatedRatio * 100)}% populated across sampled rows`,
        `Inferred type: ${dataType}`,
      ],
    })
  }

  if (columns.length === 0) return null

  let tableName = sheet.name.toUpperCase().replace(/[^A-Z0-9]+/g, '_').replace(/^_+|_+$/g, '') || 'TABLE'
  if (/^[0-9]/.test(tableName)) tableName = 'TBL_' + tableName
  const colSpan = `${indexToColLetter(region.startCol)}${hRow}:${indexToColLetter(region.endCol)}${region.endRow}`

  return {
    tableName,
    description: `Data extracted from sheet "${sheet.name}" in ${fileName}`,
    sourceSheet: sheet.name,
    sourceRange: `${indexToColLetter(region.startCol)}${region.startRow}:${indexToColLetter(region.endCol)}${region.endRow}`,
    tableType: tableTypeFromSheet(sheet),
    confidence: 0.85,
    columns,
  }
}

export class HeuristicSchemaInferenceProvider implements SchemaInferenceProvider {
  async inferSchema(input: WorkbookAnalysis, _skills?: Skill[]): Promise<InferSchemaResult> {
    const tables: WorkbookSchema['tables'] = []

    for (const sheet of input.sheets) {
      const dataRegion = sheet.primaryDataRegion
      if (!dataRegion) continue
      if (dataRegion.endRow - dataRegion.startRow < 1) continue

      const table = buildTableFromSheet(sheet, dataRegion, input.fileName)
      if (table) tables.push(table)
    }

    return { schema: { workbookName: input.fileName, tables }, suggestedSkills: [] }
  }
}
