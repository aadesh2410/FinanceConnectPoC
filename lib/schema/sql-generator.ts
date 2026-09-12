import { WorkbookSchema, ColumnSchema } from './types'

interface GenerateOptions {
  database?: string
  schema?: string
  includeLineageColumns?: boolean
}

function columnToSql(col: ColumnSchema): string {
  let typeDef = ''
  switch (col.dataType) {
    case 'VARCHAR':
      typeDef = `VARCHAR(${col.length ?? 255})`
      break
    case 'NUMBER':
      typeDef = col.precision ? `NUMBER(${col.precision},${col.scale ?? 0})` : 'NUMBER'
      break
    case 'INTEGER':
      typeDef = 'INTEGER'
      break
    case 'FLOAT':
      typeDef = 'FLOAT'
      break
    case 'BOOLEAN':
      typeDef = 'BOOLEAN'
      break
    case 'DATE':
      typeDef = 'DATE'
      break
    case 'TIMESTAMP':
      typeDef = 'TIMESTAMP'
      break
    default:
      typeDef = 'VARCHAR(255)'
  }
  const nullability = col.nullable ? '' : ' NOT NULL'
  return `    ${col.name.padEnd(30)} ${typeDef}${nullability}`
}

export function generateDDL(schema: WorkbookSchema, options: GenerateOptions = {}): string {
  const db = options.database ?? process.env.SNOWFLAKE_DATABASE ?? 'FINANCE_POC'
  const sc = options.schema ?? process.env.SNOWFLAKE_SCHEMA ?? 'EUC_SANDBOX'
  const generatedAt = new Date().toISOString()

  const statements: string[] = [
    `-- Finance Connect POC | AI EUC Schema Discovery`,
    `-- Source: ${schema.workbookName}`,
    `-- Generated: ${generatedAt}`,
    `-- SQL generated deterministically from approved schema. LLM did not generate this SQL.`,
    '',
  ]

  for (const table of schema.tables.filter((t) => !t.userRejected)) {
    const activeCols = table.columns.filter((c) => !c.userRejected)
    const colLines = activeCols.map(columnToSql)

    if (options.includeLineageColumns) {
      colLines.push(
        `    -- EUC Lineage Columns`,
        `    SOURCE_FILE                    VARCHAR(500),`,
        `    SOURCE_SHEET                   VARCHAR(255),`,
        `    SOURCE_ROW                     NUMBER,`,
        `    INGESTION_TIMESTAMP            TIMESTAMP,`,
        `    EUC_VERSION                    VARCHAR(100)`,
      )
    }

    statements.push(
      `-- Table: ${table.description}`,
      `-- Source: ${table.sourceSheet}!${table.sourceRange}`,
      `CREATE TABLE ${db}.${sc}.${table.tableName} (`,
      colLines.join(',\n'),
      `);`,
      '',
    )
  }

  return statements.join('\n')
}
