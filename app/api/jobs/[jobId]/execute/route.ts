import { NextRequest, NextResponse } from 'next/server'
import { getJob, updateJob } from '@/lib/jobs/job-store'

export const runtime = 'nodejs'

export async function POST(_req: NextRequest, { params }: { params: { jobId: string } }) {
  const job = await getJob(params.jobId)
  if (!job) return NextResponse.json({ error: 'Job not found' }, { status: 404 })
  if (job.status !== 'APPROVED') {
    return NextResponse.json({ error: 'Schema must be approved before execution' }, { status: 403 })
  }

  await updateJob(params.jobId, { status: 'EXECUTING' })
  await new Promise((r) => setTimeout(r, 1500)) // simulate execution

  const schema = job.approvedSchema!
  const simulatedAt = new Date().toISOString()
  const tables = schema.tables.filter((t) => !t.userRejected).map((t) => t.tableName)

  const executionResult = {
    mode: 'DEMO' as const,
    success: true,
    database: process.env.SNOWFLAKE_DATABASE ?? 'FINANCE_POC',
    schema: process.env.SNOWFLAKE_SCHEMA ?? 'EUC_SANDBOX',
    tables,
    simulatedAt,
    message: 'Table creation simulated successfully.',
  }

  await updateJob(params.jobId, {
    status: 'CREATED',
    executionResult,
    auditEvents: [
      ...job.auditEvents,
      { timestamp: simulatedAt, event: 'SANDBOX_EXECUTION_COMPLETED', actor: 'System', details: `DEMO MODE — ${tables.length} table(s) simulated` },
    ],
  })

  return NextResponse.json({ status: 'CREATED', executionResult })
}
