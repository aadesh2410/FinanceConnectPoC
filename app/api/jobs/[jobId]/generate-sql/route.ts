import { NextRequest, NextResponse } from 'next/server'
import { getJob, updateJob } from '@/lib/jobs/job-store'
import { generateDDL } from '@/lib/schema/sql-generator'

export const runtime = 'nodejs'

export async function POST(req: NextRequest, { params }: { params: { jobId: string } }) {
  const job = await getJob(params.jobId)
  if (!job) return NextResponse.json({ error: 'Job not found' }, { status: 404 })

  const body = await req.json().catch(() => ({}))
  const includeLineageColumns = (body as { includeLineageColumns?: boolean }).includeLineageColumns ?? false
  const schema = job.approvedSchema ?? job.proposedSchema

  const sql = generateDDL(schema, { includeLineageColumns })
  const generatedAt = new Date().toISOString()

  await updateJob(params.jobId, {
    generatedSql: sql,
    auditEvents: [
      ...job.auditEvents,
      { timestamp: generatedAt, event: 'SQL_GENERATED', actor: 'System', details: `${schema.tables.length} table(s)` },
    ],
  })

  return NextResponse.json({ sql, generatedAt })
}
