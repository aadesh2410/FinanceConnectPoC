import { NextRequest, NextResponse } from 'next/server'
import { getJob, updateJob } from '@/lib/jobs/job-store'
import { validateSchemaForApproval } from '@/lib/schema/validation'

export const runtime = 'nodejs'

export async function POST(_req: NextRequest, { params }: { params: { jobId: string } }) {
  const job = await getJob(params.jobId)
  if (!job) return NextResponse.json({ error: 'Job not found' }, { status: 404 })

  const schema = job.approvedSchema ?? job.proposedSchema
  const errors = validateSchemaForApproval(schema)
  if (errors.length > 0) {
    return NextResponse.json({ error: 'Schema validation failed', validationErrors: errors }, { status: 400 })
  }

  const approvedAt = new Date().toISOString()
  await updateJob(params.jobId, {
    status: 'APPROVED',
    approvedSchema: schema,
    auditEvents: [
      ...job.auditEvents,
      { timestamp: approvedAt, event: 'SCHEMA_APPROVED', actor: 'Demo User', details: 'Explicit approval granted' },
    ],
  })

  return NextResponse.json({ status: 'APPROVED', approvedAt })
}
