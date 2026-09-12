import { NextRequest, NextResponse } from 'next/server'
import { getJob, updateJob } from '@/lib/jobs/job-store'
import { WorkbookSchemaZod } from '@/lib/schema/zod-schemas'

export const runtime = 'nodejs'

export async function PUT(req: NextRequest, { params }: { params: { jobId: string } }) {
  const job = await getJob(params.jobId)
  if (!job) return NextResponse.json({ error: 'Job not found' }, { status: 404 })

  const body = await req.json()
  const parsed = WorkbookSchemaZod.safeParse(body.schema)
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid schema', details: parsed.error.flatten() }, { status: 400 })
  }

  const updated = await updateJob(params.jobId, {
    approvedSchema: parsed.data,
    status: 'MODIFIED',
    auditEvents: [
      ...job.auditEvents,
      { timestamp: new Date().toISOString(), event: 'SCHEMA_MODIFIED', actor: 'Demo User', details: 'User edited schema' },
    ],
  })

  return NextResponse.json({ status: updated?.status, schema: updated?.approvedSchema })
}
