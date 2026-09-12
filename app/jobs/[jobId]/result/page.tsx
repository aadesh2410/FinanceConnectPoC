import { notFound } from 'next/navigation'
import Link from 'next/link'
import { CheckCircle2, Circle, RefreshCw } from 'lucide-react'
import { PageHeader } from '@/components/common/PageHeader'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Job } from '@/lib/schema/types'

async function getJob(jobId: string): Promise<Job | null> {
  try {
    const baseUrl = process.env.NEXT_PUBLIC_BASE_URL ?? 'http://localhost:3000'
    const res = await fetch(`${baseUrl}/api/jobs/${jobId}`, { cache: 'no-store' })
    if (!res.ok) return null
    return res.json()
  } catch {
    return null
  }
}

const TIMELINE_STEPS = [
  { key: 'SCHEMA_GENERATED', label: 'Schema generated' },
  { key: 'UNDER_REVIEW', label: 'Human review completed' },
  { key: 'SCHEMA_APPROVED', label: 'Schema approved' },
  { key: 'SQL_GENERATED', label: 'SQL generated' },
  { key: 'EXECUTING', label: 'Creating Snowflake table' },
  { key: 'SANDBOX_EXECUTION_COMPLETED', label: 'Completed' },
]

export default async function ResultPage({ params }: { params: { jobId: string } }) {
  const job = await getJob(params.jobId)
  if (!job) notFound()

  // Auto-execute if approved but not yet created
  let finalJob = job
  if (job.status === 'APPROVED') {
    try {
      const baseUrl = process.env.NEXT_PUBLIC_BASE_URL ?? 'http://localhost:3000'
      const execRes = await fetch(`${baseUrl}/api/jobs/${params.jobId}/execute`, { method: 'POST' })
      if (execRes.ok) {
        const refetch = await fetch(`${baseUrl}/api/jobs/${params.jobId}`, { cache: 'no-store' })
        if (refetch.ok) finalJob = await refetch.json()
      }
    } catch {
      // ignore
    }
  }

  const result = finalJob.executionResult
  const isSuccess = finalJob.status === 'CREATED' && result?.success

  return (
    <div className="min-h-screen flex flex-col">
      <PageHeader />
      <main className="flex-1 max-w-3xl mx-auto w-full px-4 py-8 space-y-8">
        <div className="flex items-center justify-between">
          <h2 className="text-xl font-semibold text-gray-900">Execution Result</h2>
          {result?.mode === 'DEMO' && (
            <Badge variant="outline" className="text-amber-600 border-amber-300 bg-amber-50 font-semibold">
              DEMO / SIMULATED EXECUTION
            </Badge>
          )}
        </div>

        {/* Timeline */}
        <Card className="p-5 bg-white border border-gray-200">
          <h3 className="text-sm font-semibold text-gray-700 mb-4">Execution Timeline</h3>
          <div className="space-y-3">
            {TIMELINE_STEPS.map((step) => {
              const done = finalJob.auditEvents.some((e) => e.event === step.key)
              const isCurrent = step.key === 'EXECUTING' && finalJob.status === 'EXECUTING'
              return (
                <div key={step.key} className="flex items-center gap-3">
                  {done ? (
                    <CheckCircle2 className="w-4 h-4 text-green-500 flex-shrink-0" />
                  ) : isCurrent ? (
                    <RefreshCw className="w-4 h-4 text-blue-500 animate-spin flex-shrink-0" />
                  ) : (
                    <Circle className="w-4 h-4 text-gray-300 flex-shrink-0" />
                  )}
                  <span className={`text-sm ${done ? 'text-gray-700' : 'text-gray-400'}`}>{step.label}</span>
                </div>
              )
            })}
          </div>
        </Card>

        {/* Result banner */}
        {isSuccess && result && (
          <Card className="p-6 border border-green-200 bg-green-50">
            <div className="flex items-start gap-3">
              <CheckCircle2 className="w-6 h-6 text-green-600 flex-shrink-0 mt-0.5" />
              <div className="space-y-2">
                <p className="font-semibold text-green-800">SUCCESS</p>
                <p className="text-sm text-green-700">{result.message}</p>
                <div className="space-y-0.5">
                  {result.tables.map((t) => (
                    <p key={t} className="text-sm font-mono text-green-800">
                      {result.database}.{result.schema}.{t}
                    </p>
                  ))}
                </div>
              </div>
            </div>
          </Card>
        )}

        {/* Audit trail */}
        <Card className="p-5 bg-white border border-gray-200">
          <h3 className="text-sm font-semibold text-gray-700 mb-4">Audit Trail</h3>
          <div className="space-y-2">
            {finalJob.auditEvents.map((evt, i) => (
              <div key={i} className="flex gap-3 text-xs">
                <span className="text-gray-400 font-mono flex-shrink-0">
                  {new Date(evt.timestamp).toLocaleTimeString()}
                </span>
                <span className="text-gray-600">{evt.event.replace(/_/g, ' ')}</span>
                <span className="text-gray-400 truncate">{evt.details}</span>
              </div>
            ))}
          </div>
        </Card>

        {/* Generated SQL */}
        {finalJob.generatedSql && (
          <Card className="p-5 bg-white border border-gray-200">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-semibold text-gray-700">Generated DDL</h3>
            </div>
            <pre className="text-xs font-mono bg-gray-50 rounded p-4 border text-gray-800 whitespace-pre-wrap overflow-auto max-h-80">
              {finalJob.generatedSql}
            </pre>
          </Card>
        )}

        <div className="flex justify-end">
          <Link href="/">
            <Button variant="outline">Start New Analysis</Button>
          </Link>
        </div>
      </main>
    </div>
  )
}
