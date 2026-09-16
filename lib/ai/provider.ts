import { WorkbookSchema } from '@/lib/schema/types'
import { AnalyzedSheet } from '@/lib/excel/region-detector'
import { NamedRange } from '@/lib/excel/parser'
import { Skill, SuggestedSkill } from '@/lib/skills/types'

export interface WorkbookAnalysis {
  fileName: string
  fileSize: number
  sheets: AnalyzedSheet[]
  namedRanges: NamedRange[]
}

export interface InferSchemaResult {
  schema: WorkbookSchema
  suggestedSkills: SuggestedSkill[]
}

export interface SchemaInferenceProvider {
  inferSchema(input: WorkbookAnalysis, skills?: Skill[]): Promise<InferSchemaResult>
}
