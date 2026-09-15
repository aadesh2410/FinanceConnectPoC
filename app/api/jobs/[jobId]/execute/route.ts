import { NextRequest, NextResponse } from 'next/server'
import { getJob, updateJob } from '@/lib/jobs/job-store'
import { generateDDL } from '@/lib/schema/sql-generator'
import { executeDDL, isSnowflakeConfigured, upsertRows } from '@/lib/snowflake/client'

export const runtime = 'nodejs'

export async function POST(_req: NextRequest, { params }: { params: { jobId: string } }) {
  const job = await getJob(params.jobId)
  if (!job) return NextResponse.json({ error: 'Job not found' }, { status: 404 })
  if (job.status !== 'APPROVED') {
    return NextResponse.json({ error: 'Schema must be approved before execution' }, { status: 403 })
  }

  await updateJob(params.jobId, { status: 'EXECUTING' })

  const schema = job.approvedSchema!
  const database = process.env.SNOWFLAKE_DATABASE ?? 'FINANCE_POC'
  const sfSchema = process.env.SNOWFLAKE_SCHEMA ?? 'EUC_SANDBOX'
  const executedAt = new Date().toISOString()

  if (isSnowflakeConfigured()) {
    try {
      const ddl = generateDDL(schema, { database, schema: sfSchema })
      const createdTables = await executeDDL(ddl)

      // Upsert rows if available
      let totalRowsLoaded = 0
      if (job.tableRows) {
        for (const table of schema.tables.filter((t) => !t.userRejected)) {
          const rows = job.tableRows[table.tableName]
          if (!rows?.length) continue
          const colMap: Record<string, string> = {}
          for (const col of table.columns) {
            colMap[col.sourceColumn] = col.name
          }
          const sfCols = table.columns
            .filter((c) => !c.userRejected)
            .map((c) => ({ name: c.name, dataType: c.dataType, isPrimaryKey: c.isPrimaryKey }))
          const count = await upsertRows(table.tableName, sfCols, rows, colMap)
          totalRowsLoaded += count
        }
      }

      const executionResult = {
        mode: 'SNOWFLAKE' as const,
        success: true,
        database,
        schema: sfSchema,
        tables: createdTables,
        message: `${createdTables.length} table(s) created, ${totalRowsLoaded} row(s) upserted in ${database}.${sfSchema}.`,
      }

      await updateJob(params.jobId, {
        status: 'CREATED',
        executionMode: 'SNOWFLAKE',
        executionResult,
        auditEvents: [
          ...job.auditEvents,
          { timestamp: executedAt, event: 'SNOWFLAKE_EXECUTION_COMPLETED', actor: 'System', details: `SNOWFLAKE — ${createdTables.length} table(s) created: ${createdTables.join(', ')}` },
        ],
      })

      return NextResponse.json({ status: 'CREATED', executionResult })
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err)
      const executionResult = {
        mode: 'SNOWFLAKE' as const,
        success: false,
        database,
        schema: sfSchema,
        tables: [],
        message: `Snowflake error: ${message}`,
      }

      await updateJob(params.jobId, {
        status: 'FAILED',
        executionMode: 'SNOWFLAKE',
        executionResult,
        auditEvents: [
          ...job.auditEvents,
          { timestamp: executedAt, event: 'SNOWFLAKE_EXECUTION_FAILED', actor: 'System', details: message },
        ],
      })

      return NextResponse.json({ status: 'FAILED', executionResult }, { status: 500 })
    }
  }

  // Demo fallback (no Snowflake credentials)
  await new Promise((r) => setTimeout(r, 1500))
  const tables = schema.tables.filter((t) => !t.userRejected).map((t) => t.tableName)

  const executionResult = {
    mode: 'DEMO' as const,
    success: true,
    database,
    schema: sfSchema,
    tables,
    simulatedAt: executedAt,
    message: 'Table creation simulated successfully.',
  }

  await updateJob(params.jobId, {
    status: 'CREATED',
    executionResult,
    auditEvents: [
      ...job.auditEvents,
      { timestamp: executedAt, event: 'SANDBOX_EXECUTION_COMPLETED', actor: 'System', details: `DEMO MODE — ${tables.length} table(s) simulated` },
    ],
  })

  return NextResponse.json({ status: 'CREATED', executionResult })
}
