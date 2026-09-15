import { WorkbookSchema, SchemaDiff, TableDiff, ColumnDiff } from './types'

export function computeSchemaDiff(
  previousSchema: WorkbookSchema,
  newSchema: WorkbookSchema,
  previousJobId: string
): SchemaDiff {
  const tables: TableDiff[] = []
  const alterStatements: string[] = []

  for (const newTable of newSchema.tables.filter((t) => !t.userRejected)) {
    const prevTable = previousSchema.tables.find((t) => t.tableName === newTable.tableName)
    if (!prevTable) {
      tables.push({ tableName: newTable.tableName, isNew: true, columnDiffs: [] })
      continue
    }
    const columnDiffs: ColumnDiff[] = []
    // New columns or type changes
    for (const col of newTable.columns.filter((c) => !c.userRejected)) {
      const prevCol = prevTable.columns.find((c) => c.name === col.name)
      if (!prevCol) {
        columnDiffs.push({ type: 'ADDED', columnName: col.name, newType: col.dataType })
        alterStatements.push(`ALTER TABLE ${newTable.tableName} ADD COLUMN ${col.name} ${col.dataType};`)
      } else if (prevCol.dataType !== col.dataType) {
        columnDiffs.push({
          type: 'TYPE_CHANGED',
          columnName: col.name,
          oldType: prevCol.dataType,
          newType: col.dataType,
        })
      }
    }
    // Dropped columns
    for (const col of prevTable.columns.filter((c) => !c.userRejected)) {
      if (!newTable.columns.find((c) => c.name === col.name && !c.userRejected)) {
        columnDiffs.push({ type: 'DROPPED', columnName: col.name, oldType: col.dataType })
        alterStatements.push(`ALTER TABLE ${newTable.tableName} DROP COLUMN ${col.name};`)
      }
    }
    if (columnDiffs.length > 0) {
      tables.push({ tableName: newTable.tableName, isNew: false, columnDiffs })
    }
  }

  return { previousJobId, hasChanges: tables.length > 0, tables, alterStatements }
}
