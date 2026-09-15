import { NextRequest, NextResponse } from 'next/server'
import { v4 as uuidv4 } from 'uuid'
import crypto from 'crypto'
import { analyzeWorkbook } from '@/lib/excel/workbook-analyzer'
import { getSchemaInferenceProvider } from '@/lib/ai'
import { saveJob, findJobByHash } from '@/lib/jobs/job-store'
import { Job, AuditEvent } from '@/lib/schema/types'
import { computeSchemaDiff } from '@/lib/schema/diff'
import { extractSampleRows, extractAllRows } from '@/lib/excel/sample-extractor'

export const runtime = 'nodejs'
export const maxDuration = 120

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData()
    const file = formData.get('file') as File | null
    const modeOverride = formData.get('aiMode') as string | null

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
    const hash = crypto.createHash('md5').update(buffer).digest('hex')
    const existingJob = await findJobByHash(hash)
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
    if (modeOverride) process.env.AI_MODE = modeOverride
    console.log('[analyze] AI_MODE =', process.env.AI_MODE, '| ANTHROPIC_API_KEY set =', !!process.env.ANTHROPIC_API_KEY)
    const provider = getSchemaInferenceProvider()
    const proposedSchema = await provider.inferSchema(analysis)

    const totalColumns = proposedSchema.tables.reduce((acc, t) => acc + t.columns.length, 0)
    const lowConfidenceCount = proposedSchema.tables.reduce(
      (acc, t) => acc + t.columns.filter((c) => c.confidence < 0.8).length, 0
    )
    summary.totalProposedColumns = totalColumns
    summary.lowConfidenceFieldCount = lowConfidenceCount

    // Compute schema readiness dynamically
    const avgTableConfidence = proposedSchema.tables.length > 0
      ? proposedSchema.tables.reduce((acc, t) => acc + t.confidence, 0) / proposedSchema.tables.length
      : 0.5
    const avgSheetConfidence = summary.sheets.length > 0
      ? summary.sheets.reduce((acc, s) => acc + s.confidence, 0) / summary.sheets.length
      : 0.5
    const lowConfidenceRatio = totalColumns > 0 ? lowConfidenceCount / totalColumns : 0
    const rawScore = (avgTableConfidence * 0.5) + (avgSheetConfidence * 0.3) + ((1 - lowConfidenceRatio) * 0.2)
    summary.schemaReadinessScore = Math.min(1, Math.max(0, Math.round(rawScore * 100) / 100))

    auditEvents.push({
      timestamp: new Date().toISOString(),
      event: 'SCHEMA_GENERATED',
      actor: 'AI',
      details: `${summary.aiMode === 'mock' ? 'Mock' : 'Claude'} provider | ${proposedSchema.tables.length} tables | ${totalColumns} columns`,
    })

    // Extract sample rows and all rows per table; mark first non-rejected column as primary key
    const tableRows: Record<string, Array<Record<string, string>>> = {}
    for (const table of proposedSchema.tables.filter((t) => !t.userRejected)) {
      const sheet = analysis.sheets.find((s) => s.name === table.sourceSheet)
      if (sheet) {
        table.sampleRows = extractSampleRows(sheet, table.sourceRange)
        tableRows[table.tableName] = extractAllRows(sheet, table.sourceRange)
      }
      // Mark first non-rejected column as primary key
      const firstCol = table.columns.find((c) => !c.userRejected)
      if (firstCol) firstCol.isPrimaryKey = true
    }

    // Compute diff if this workbook was seen before
    const previousSchema = existingJob
      ? (existingJob.approvedSchema ?? existingJob.proposedSchema)
      : null
    const schemaDiff = previousSchema
      ? computeSchemaDiff(previousSchema, proposedSchema, existingJob!.jobId)
      : undefined

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
      workbookHash: hash,
      schemaDiff,
      tableRows,
    }

    await saveJob(job)

    if (existingJob) {
      return NextResponse.json({
        jobId,
        status: job.status,
        workbookSummary: summary,
        schema: proposedSchema,
        duplicate: true,
        previousJobId: existingJob.jobId,
        schemaDiff,
      })
    }

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
