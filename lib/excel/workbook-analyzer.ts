import { parseWorkbook, WorkbookData } from './parser'
import { analyzeSheet, AnalyzedSheet } from './region-detector'
import { WorkbookAnalysis } from '@/lib/ai/provider'
import { WorkbookSummary, SheetSummary, TableType } from '@/lib/schema/types'

export interface AnalysisResult {
  analysis: WorkbookAnalysis
  summary: WorkbookSummary
}

export async function analyzeWorkbook(buffer: Buffer, fileName: string): Promise<AnalysisResult> {
  const workbookData: WorkbookData = await parseWorkbook(buffer, fileName)

  const analyzedSheets: AnalyzedSheet[] = workbookData.sheets.map(analyzeSheet)

  const sheets: SheetSummary[] = analyzedSheets.map((sheet) => {
    const dataRegions = sheet.regions.filter((r) => r.type === 'DATA')
    const hasData = dataRegions.length > 0
    let classification: TableType | 'UNKNOWN' = 'UNKNOWN'
    if (sheet.rowCount > 50 && hasData) classification = 'TRANSACTIONAL'
    else if (sheet.rowCount <= 30 && hasData) classification = 'LOOKUP'
    else if (hasData) classification = 'SUMMARY'

    return {
      name: sheet.name,
      rowCount: sheet.rowCount,
      colCount: sheet.colCount,
      candidateRegionCount: dataRegions.length,
      confidence: hasData ? 0.88 : 0.4,
      classification,
    }
  })

  const candidateTableCount = sheets.filter((s) => s.candidateRegionCount > 0).length
  const formulaRegionCount = analyzedSheets.reduce(
    (acc, s) => acc + s.cells.filter((c) => c.type === 'formula').length, 0
  )

  const summary: WorkbookSummary = {
    fileName,
    fileSize: workbookData.fileSize,
    sheetCount: workbookData.sheets.length,
    candidateTableCount,
    totalProposedColumns: 0, // filled after schema inference
    lowConfidenceFieldCount: 0, // filled after schema inference
    formulaRegionCount,
    schemaReadinessScore: 0, // computed after schema inference in analyze route
    aiMode: (process.env.AI_MODE as 'mock' | 'claude') ?? 'mock',
    sheets,
  }

  const analysis: WorkbookAnalysis = {
    fileName,
    fileSize: workbookData.fileSize,
    sheets: analyzedSheets,
    namedRanges: workbookData.namedRanges,
  }

  return { analysis, summary }
}
