import { WorkbookSchema } from './types'

const VALID_TYPES = new Set(['VARCHAR', 'NUMBER', 'INTEGER', 'FLOAT', 'BOOLEAN', 'DATE', 'TIMESTAMP'])
const IDENTIFIER_RE = /^[A-Z][A-Z0-9_]{0,254}$/

export interface ValidationError {
  table?: string
  column?: string
  field: string
  message: string
}

export function validateSchemaForApproval(schema: WorkbookSchema): ValidationError[] {
  const errors: ValidationError[] = []

  if (!schema.tables || schema.tables.length === 0) {
    errors.push({ field: 'tables', message: 'Schema must contain at least one table' })
    return errors
  }

  for (const table of schema.tables.filter((t) => !t.userRejected)) {
    if (!IDENTIFIER_RE.test(table.tableName)) {
      errors.push({ table: table.tableName, field: 'tableName', message: 'Table name must be uppercase letters, numbers and underscores, starting with a letter' })
    }

    const activeCols = table.columns.filter((c) => !c.userRejected)
    if (activeCols.length === 0) {
      errors.push({ table: table.tableName, field: 'columns', message: 'Table must have at least one column' })
    }

    const names = new Set<string>()
    for (const col of activeCols) {
      if (!IDENTIFIER_RE.test(col.name)) {
        errors.push({ table: table.tableName, column: col.name, field: 'name', message: 'Column name must be uppercase letters, numbers and underscores' })
      }
      if (names.has(col.name)) {
        errors.push({ table: table.tableName, column: col.name, field: 'name', message: `Duplicate column name: ${col.name}` })
      }
      names.add(col.name)

      if (!VALID_TYPES.has(col.dataType)) {
        errors.push({ table: table.tableName, column: col.name, field: 'dataType', message: `Invalid data type: ${col.dataType}` })
      }

      if (col.dataType === 'NUMBER' && col.precision !== undefined) {
        if (col.precision <= 0) {
          errors.push({ table: table.tableName, column: col.name, field: 'precision', message: 'Precision must be > 0' })
        }
        if (col.scale !== undefined && col.scale > col.precision) {
          errors.push({ table: table.tableName, column: col.name, field: 'scale', message: 'Scale must be <= precision' })
        }
      }
    }
  }

  return errors
}
