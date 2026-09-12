import { WorkbookSchema } from '@/lib/schema/types'
import { AnalyzedSheet } from '@/lib/excel/region-detector'
import { NamedRange } from '@/lib/excel/parser'

export interface WorkbookAnalysis {
  fileName: string
  fileSize: number
  sheets: AnalyzedSheet[]
  namedRanges: NamedRange[]
}

export interface SchemaInferenceProvider {
  inferSchema(input: WorkbookAnalysis): Promise<WorkbookSchema>
}
