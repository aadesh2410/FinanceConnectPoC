export type SkillCategory =
  | 'ORG_CONTEXT'
  | 'COLUMN_NAMING'
  | 'DATA_TYPE_RULE'
  | 'PERIOD_FORMAT'
  | 'STRUCTURE_RULE'

export interface Skill {
  id: string
  name: string
  category: SkillCategory
  rule: string
  examples?: string[]
  createdAt: string
  source: 'MANUAL' | 'AI_SUGGESTED' | 'CONFIRMED'
  usageCount: number
  enabled: boolean
}

export interface SuggestedSkill {
  name: string
  category: SkillCategory
  rule: string
  examples?: string[]
  confidence: number
  reason: string
}
