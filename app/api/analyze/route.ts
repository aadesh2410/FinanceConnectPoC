import { NextRequest, NextResponse } from 'next/server'
import { v4 as uuidv4 } from 'uuid'
import { analyzeWorkbook } from '@/lib/excel/workbook-analyzer'
import { getSchemaInferenceProvider } from '@/lib/ai'
import { saveJob } from '@/lib/jobs/job-store'
import { Job, AuditEvent } from '@/lib/schema/types'

export const runtime = 'nodejs'
export const maxDuration = 60

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData()
    const file = formData.get('file') as File | null

    if (!file) {
      return NextResponse.json({ error: 'No file uploaded' }, { status: 400 })
    }

    if (!file.name.endsWith('.xlsx')) {
      return NextResponse.json({ error: 'Only .xlsx files are supported' }, { status: 400 })
    }

    if (file.size > 10 * 1024 * 1024) {
      return NextResponse.json({ error: 'File size must be under 10 MB' }, { status: 413 })
    }

    const buffer = Buffer.from(await file.arrayBuffer())
    const jobId = uuidv4()
    const now = new Date().toISOString()

    const auditEvents: AuditEvent[] = [
      { timestamp: now, event: 'FILE_UPLOADED', actor: 'Demo User', details: file.name },
    ]

    // Parse + analyze workbook
    const { analysis, summary } = await analyzeWorkbook(buffer, file.name)
    auditEvents.push({
      timestamp: new Date().toISOString(),
      event: 'WORKBOOK_ANALYZED',
      actor: 'System',
      details: `${summary.sheetCount} sheets, ${summary.candidateTableCount} candidate regions`,
    })

    // Infer schema
    const provider = getSchemaInferenceProvider()
    const proposedSchema = await provider.inferSchema(analysis)

    const totalColumns = proposedSchema.tables.reduce((acc, t) => acc + t.columns.length, 0)
    const lowConfidenceCount = proposedSchema.tables.reduce(
      (acc, t) => acc + t.columns.filter((c) => c.confidence < 0.8).length, 0
    )
    summary.totalProposedColumns = totalColumns
    summary.lowConfidenceFieldCount = lowConfidenceCount

    auditEvents.push({
      timestamp: new Date().toISOString(),
      event: 'SCHEMA_GENERATED',
      actor: 'AI',
      details: `${summary.aiMode === 'mock' ? 'Mock' : 'Claude'} provider | ${proposedSchema.tables.length} tables | ${totalColumns} columns`,
    })

    const job: Job = {
      jobId,
      fileName: file.name,
      createdAt: now,
      status: 'SCHEMA_GENERATED',
      workbookSummary: summary,
      proposedSchema,
      approvedSchema: null,
      generatedSql: null,
      executionMode: 'DEMO',
      executionResult: null,
      auditEvents,
    }

    await saveJob(job)

    return NextResponse.json({
      jobId,
      status: job.status,
      workbookSummary: summary,
      schema: proposedSchema,
    })
  } catch (err) {
    console.error('Analyze error:', err)
    return NextResponse.json({ error: 'Failed to analyze workbook' }, { status: 500 })
  }
}
