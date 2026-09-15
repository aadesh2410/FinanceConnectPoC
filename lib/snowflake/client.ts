import snowflake from 'snowflake-sdk'

export interface SnowflakeConfig {
  account: string
  username: string
  password: string
  database: string
  schema: string
  warehouse: string
  role?: string
}

function getConfig(): SnowflakeConfig {
  const required = ['SNOWFLAKE_ACCOUNT', 'SNOWFLAKE_USER', 'SNOWFLAKE_PASSWORD', 'SNOWFLAKE_DATABASE', 'SNOWFLAKE_SCHEMA', 'SNOWFLAKE_WAREHOUSE']
  for (const key of required) {
    if (!process.env[key]) throw new Error(`Missing env var: ${key}`)
  }
  return {
    account: process.env.SNOWFLAKE_ACCOUNT!,
    username: process.env.SNOWFLAKE_USER!,
    password: process.env.SNOWFLAKE_PASSWORD!,
    database: process.env.SNOWFLAKE_DATABASE!,
    schema: process.env.SNOWFLAKE_SCHEMA!,
    warehouse: process.env.SNOWFLAKE_WAREHOUSE!,
    role: process.env.SNOWFLAKE_ROLE,
  }
}

function createConnection(cfg: SnowflakeConfig) {
  return snowflake.createConnection({
    account: cfg.account,
    username: cfg.username,
    password: cfg.password,
    database: cfg.database,
    schema: cfg.schema,
    warehouse: cfg.warehouse,
    role: cfg.role,
  })
}

function connectAsync(conn: ReturnType<typeof snowflake.createConnection>): Promise<void> {
  return new Promise((resolve, reject) => {
    conn.connect((err) => (err ? reject(err) : resolve()))
  })
}

function executeAsync(conn: ReturnType<typeof snowflake.createConnection>, sql: string): Promise<void> {
  return new Promise((resolve, reject) => {
    conn.execute({
      sqlText: sql,
      complete: (err) => (err ? reject(err) : resolve()),
    })
  })
}

function destroyAsync(conn: ReturnType<typeof snowflake.createConnection>): Promise<void> {
  return new Promise((resolve) => {
    conn.destroy(() => resolve())
  })
}

/** Split a DDL script into individual statements and execute each one. */
export async function executeDDL(ddlScript: string): Promise<string[]> {
  const cfg = getConfig()
  const conn = createConnection(cfg)
  await connectAsync(conn)

  // Split on semicolons, skip comment-only or blank chunks
  const statements = ddlScript
    .split(';')
    .map((s) => s.trim())
    .filter((s) => /^\s*CREATE\s/i.test(s.replace(/--[^\n]*/g, '')))

  console.log(`[snowflake] ${statements.length} statement(s) to execute`)
  statements.forEach((s, i) => console.log(`[snowflake] stmt[${i}]: ${s.slice(0, 120)}`))

  const executed: string[] = []
  try {
    await executeAsync(conn, `CREATE DATABASE IF NOT EXISTS ${cfg.database};`)
    await executeAsync(conn, `USE DATABASE ${cfg.database};`)
    await executeAsync(conn, `CREATE SCHEMA IF NOT EXISTS ${cfg.schema};`)
    await executeAsync(conn, `USE SCHEMA ${cfg.schema};`)
    for (const stmt of statements) {
      console.log(`[snowflake] executing: ${stmt.slice(0, 120)}`)
      await executeAsync(conn, stmt + ';')
      const match = stmt.match(/CREATE\s+(?:OR\s+REPLACE\s+)?TABLE\s+(?:\S+\.)?(\w+)/i)
      if (match) executed.push(match[1])
    }
  } catch (err) {
    console.error('[snowflake] execution error:', err)
    throw err
  } finally {
    await destroyAsync(conn)
  }

  return executed
}

function snowflakeTypeCast(dataType: string): string {
  switch (dataType) {
    case 'NUMBER': return 'NUMBER'
    case 'INTEGER': return 'INTEGER'
    case 'FLOAT': return 'FLOAT'
    case 'BOOLEAN': return 'BOOLEAN'
    case 'DATE': return 'DATE'
    case 'TIMESTAMP': return 'TIMESTAMP'
    default: return 'VARCHAR'
  }
}

export async function upsertRows(
  tableName: string,
  columns: Array<{ name: string; dataType: string; isPrimaryKey?: boolean }>,
  rows: Array<Record<string, string>>,
  sourceColumnToSnowflake: Record<string, string>
): Promise<number> {
  if (rows.length === 0) return 0
  const cfg = getConfig()
  const conn = createConnection(cfg)
  await connectAsync(conn)

  const sfCols = columns.filter((c) => c.name)
  const pkCol = sfCols.find((c) => c.isPrimaryKey) ?? sfCols[0]

  const BATCH_SIZE = 500
  let totalUpserted = 0

  try {
    await executeAsync(conn, `USE DATABASE ${cfg.database};`)
    await executeAsync(conn, `USE SCHEMA ${cfg.schema};`)

    for (let i = 0; i < rows.length; i += BATCH_SIZE) {
      const batch = rows.slice(i, i + BATCH_SIZE)

      const valueRows = batch
        .map((row) => {
          const vals = sfCols.map((col) => {
            const srcHeader = Object.entries(sourceColumnToSnowflake).find(
              ([, sfName]) => sfName === col.name
            )?.[0]
            const raw = srcHeader ? (row[srcHeader] ?? '') : ''
            const escaped = String(raw).replace(/'/g, "''")
            return `'${escaped}'`
          })
          return `(${vals.join(', ')})`
        })
        .join(',\n  ')

      const selectCols = sfCols
        .map((col, idx) => {
          const cast = snowflakeTypeCast(col.dataType)
          return `TRY_CAST($${idx + 1} AS ${cast}) AS ${col.name}`
        })
        .join(', ')

      const updateSet = sfCols
        .filter((c) => c.name !== pkCol.name)
        .map((c) => `t.${c.name} = s.${c.name}`)
        .join(', ')

      const insertCols = sfCols.map((c) => c.name).join(', ')
      const insertVals = sfCols.map((c) => `s.${c.name}`).join(', ')

      const mergeSql = `
MERGE INTO ${tableName} AS t
USING (
  SELECT ${selectCols}
  FROM VALUES
  ${valueRows}
) AS s ON t.${pkCol.name} = s.${pkCol.name}
${updateSet ? `WHEN MATCHED THEN UPDATE SET ${updateSet}` : ''}
WHEN NOT MATCHED THEN INSERT (${insertCols}) VALUES (${insertVals});`

      await executeAsync(conn, mergeSql)
      totalUpserted += batch.length
    }
  } finally {
    await destroyAsync(conn)
  }

  return totalUpserted
}

export function isSnowflakeConfigured(): boolean {
  return !!(
    process.env.SNOWFLAKE_ACCOUNT &&
    process.env.SNOWFLAKE_USER &&
    process.env.SNOWFLAKE_PASSWORD &&
    process.env.SNOWFLAKE_DATABASE &&
    process.env.SNOWFLAKE_SCHEMA &&
    process.env.SNOWFLAKE_WAREHOUSE
  )
}
