import { NextRequest, NextResponse } from 'next/server'
import { getJob } from '@/lib/jobs/job-store'

export const runtime = 'nodejs'

export async function GET(_req: NextRequest, { params }: { params: { jobId: string } }) {
  const job = await getJob(params.jobId)
  if (!job) return NextResponse.json({ error: 'Job not found' }, { status: 404 })
  return NextResponse.json(job)
}
