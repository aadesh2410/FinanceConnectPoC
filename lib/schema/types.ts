export type SnowflakeDataType =
  | 'VARCHAR'
  | 'NUMBER'
  | 'INTEGER'
  | 'FLOAT'
  | 'BOOLEAN'
  | 'DATE'
  | 'TIMESTAMP'

export type TableType = 'TRANSACTIONAL' | 'LOOKUP' | 'SUMMARY' | 'CROSSTAB'

export type JobStatus =
  | 'UPLOADED'
  | 'ANALYZING'
  | 'SCHEMA_GENERATED'
  | 'UNDER_REVIEW'
  | 'MODIFIED'
  | 'APPROVED'
  | 'EXECUTING'
  | 'CREATED'
  | 'FAILED'

export interface ColumnSchema {
  name: string
  sourceColumn: string
  sourceRange: string
  dataType: SnowflakeDataType
  length?: number
  precision?: number
  scale?: number
  nullable: boolean
  description?: string
  confidence: number
  evidence: string[]
  userModified?: boolean
  userRejected?: boolean
  isPrimaryKey?: boolean
}

export interface PivotConfig {
  dimensionColumnName: string
  dimensionType: 'INTEGER' | 'VARCHAR'
  headerRow: number
  hierarchySourceCols: string[]
  hierarchyColumnNames: string[]
  /** For each element in hierarchySourceCols: true = carry forward last non-empty value when cell is blank (handles merged cells) */
  carryForwardHierarchyCols?: boolean[]
  valueColumnName: string
  dataStartRow: number
  dataEndRow: number
  pivotStartCol: string
  pivotEndCol: string
  excludePatterns: string[]
  /** Regex patterns that match total/subtotal row labels (any hierarchy column value) */
  totalPatterns?: string[]
  /** Regex patterns that match section-header-only rows (rows with no data values, used as group labels) */
  sectionHeaderPatterns?: string[]
  /** If set, emit a column with this name containing DATA | SUBTOTAL | GRAND_TOTAL | SECTION_HEADER */
  rowTypeColumnName?: string
  /** If set, emit a boolean column with this name: true when row matches totalPatterns */
  isTotalColumnName?: string
}

export interface TableSchema {
  tableName: string
  description: string
  sourceSheet: string
  sourceRange: string
  tableType: TableType
  confidence: number
  columns: ColumnSchema[]
  userRejected?: boolean
  sampleRows?: string[][]
  isPivot?: boolean
  pivotConfig?: PivotConfig
}

export interface WorkbookSchema {
  workbookName: string
  tables: TableSchema[]
}

export interface SheetSummary {
  name: string
  rowCount: number
  colCount: number
  candidateRegionCount: number
  confidence: number
  classification: TableType | 'UNKNOWN'
}

export interface WorkbookSummary {
  fileName: string
  fileSize: number
  sheetCount: number
  candidateTableCount: number
  totalProposedColumns: number
  lowConfidenceFieldCount: number
  formulaRegionCount: number
  schemaReadinessScore: number
  aiMode: 'mock' | 'claude'
  sheets: SheetSummary[]
}

export interface ColumnDiff {
  type: 'ADDED' | 'DROPPED' | 'TYPE_CHANGED'
  columnName: string
  oldType?: string
  newType?: string
}

export interface TableDiff {
  tableName: string
  isNew: boolean
  columnDiffs: ColumnDiff[]
}

export interface SchemaDiff {
  previousJobId: string
  hasChanges: boolean
  tables: TableDiff[]
  alterStatements: string[]
}

export interface AuditEvent {
  timestamp: string
  event: string
  actor: 'Demo User' | 'System' | 'AI'
  details: string
}

export interface ExecutionResult {
  mode: 'DEMO' | 'SNOWFLAKE'
  success: boolean
  database: string
  schema: string
  tables: string[]
  simulatedAt?: string
  queryId?: string
  message: string
}

export interface Job {
  jobId: string
  fileName: string
  createdAt: string
  status: JobStatus
  workbookSummary: WorkbookSummary
  proposedSchema: WorkbookSchema
  approvedSchema: WorkbookSchema | null
  generatedSql: string | null
  executionMode: 'DEMO' | 'SNOWFLAKE'
  executionResult: ExecutionResult | null
  auditEvents: AuditEvent[]
  workbookHash?: string
  schemaDiff?: SchemaDiff
  tableRows?: Record<string, Array<Record<string, string>>>
  suggestedSkills?: import('@/lib/skills/types').SuggestedSkill[]
}
