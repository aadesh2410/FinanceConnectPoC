import { z } from 'zod'

export const SnowflakeDataTypeSchema = z.enum([
  'VARCHAR', 'NUMBER', 'INTEGER', 'FLOAT', 'BOOLEAN', 'DATE', 'TIMESTAMP'
])

export const TableTypeSchema = z.enum([
  'TRANSACTIONAL', 'LOOKUP', 'SUMMARY', 'CROSSTAB'
])

export const ColumnSchemaZod = z.object({
  name: z.string().min(1),
  sourceColumn: z.string(),
  sourceRange: z.string(),
  dataType: SnowflakeDataTypeSchema,
  length: z.number().positive().optional(),
  precision: z.number().positive().optional(),
  scale: z.number().min(0).optional(),
  nullable: z.boolean(),
  description: z.string().optional(),
  confidence: z.number().min(0).max(1),
  evidence: z.array(z.string()),
  userModified: z.boolean().optional(),
  userRejected: z.boolean().optional(),
})

export const TableSchemaZod = z.object({
  tableName: z.string().min(1),
  description: z.string(),
  sourceSheet: z.string(),
  sourceRange: z.string(),
  tableType: TableTypeSchema,
  confidence: z.number().min(0).max(1),
  columns: z.array(ColumnSchemaZod),
  userRejected: z.boolean().optional(),
})

export const WorkbookSchemaZod = z.object({
  workbookName: z.string(),
  tables: z.array(TableSchemaZod),
})
