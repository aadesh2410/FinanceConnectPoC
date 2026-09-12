import { WorkbookSchema } from '@/lib/schema/types'
import { AnalyzedSheet } from '@/lib/excel/region-detector'

export interface WorkbookAnalysis {
  fileName: string
  fileSize: number
  sheets: AnalyzedSheet[]
}

export interface SchemaInferenceProvider {
  inferSchema(input: WorkbookAnalysis): Promise<WorkbookSchema>
}
