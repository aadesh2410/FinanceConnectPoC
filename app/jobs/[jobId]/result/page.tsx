'use client'

import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'
import { CheckCircle2, Circle, RefreshCw, XCircle } from 'lucide-react'
import { PageHeader } from '@/components/common/PageHeader'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Job } from '@/lib/schema/types'

const TERMINAL_STATUSES = new Set(['CREATED', 'FAILED'])
const POLL_INTERVAL_MS = 2000

const TIMELINE_STEPS = [
  { key: 'SCHEMA_GENERATED', label: 'Schema generated' },
  { key: 'UNDER_REVIEW', label: 'Human review completed' },
  { key: 'SCHEMA_APPROVED', label: 'Schema approved' },
  { key: 'SQL_GENERATED', label: 'SQL generated' },
  { key: 'EXECUTING', label: 'Creating Snowflake table' },
  { key: 'SNOWFLAKE_EXECUTION_COMPLETED', label: 'Completed' },
  { key: 'SANDBOX_EXECUTION_COMPLETED', label: 'Completed (Demo)' },
]

export default function ResultPage() {
  const { jobId } = useParams<{ jobId: string }>()
  const [job, setJob] = useState<Job | null>(null)
  const [loading, setLoading] = useState(true)
  const [executing, setExecuting] = useState(false)

  async function fetchJob(): Promise<Job | null> {
    const res = await fetch(`/api/jobs/${jobId}`, { cache: 'no-store' })
    if (!res.ok) return null
    return res.json()
  }

  async function triggerExecute() {
    setExecuting(true)
    await fetch(`/api/jobs/${jobId}/execute`, { method: 'POST' })
    setExecuting(false)
  }

  async function retryExecute() {
    // Reset job status back to APPROVED so /execute will run again
    await fetch(`/api/jobs/${jobId}/approve`, { method: 'POST' })
    await triggerExecute()
    const refreshed = await fetchJob()
    if (refreshed) setJob(refreshed)
  }

  useEffect(() => {
    let cancelled = false
    let timer: ReturnType<typeof setTimeout>

    async function poll() {
      const current = await fetchJob()
      if (cancelled) return
      if (!current) { setLoading(false); return }

      setJob(current)
      setLoading(false)

      if (current.status === 'APPROVED') {
        await triggerExecute()
      }

      if (!TERMINAL_STATUSES.has(current.status)) {
        timer = setTimeout(poll, POLL_INTERVAL_MS)
      }
    }

    poll()
    return () => { cancelled = true; clearTimeout(timer) }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [jobId])

  if (loading) {
    return (
      <div className="min-h-screen flex flex-col">
        <PageHeader />
        <main className="flex-1 flex items-center justify-center">
          <RefreshCw className="w-6 h-6 animate-spin text-gray-400" />
        </main>
      </div>
    )
  }

  if (!job) {
    return (
      <div className="min-h-screen flex flex-col">
        <PageHeader />
        <main className="flex-1 flex items-center justify-center text-gray-500">Job not found.</main>
      </div>
    )
  }

  const result = job.executionResult
  const isSuccess = job.status === 'CREATED' && result?.success
  const isFailed = job.status === 'FAILED'
  const isExecuting = job.status === 'EXECUTING' || executing

  return (
    <div className="min-h-screen flex flex-col">
      <PageHeader />
      <main className="flex-1 max-w-3xl mx-auto w-full px-4 py-8 space-y-8">
        <div className="flex items-center justify-between">
          <h2 className="text-xl font-semibold text-gray-900">Execution Result</h2>
          <div className="flex items-center gap-2">
            {isExecuting && (
              <Badge variant="outline" className="text-blue-600 border-blue-300 bg-blue-50 font-semibold flex items-center gap-1">
                <RefreshCw className="w-3 h-3 animate-spin" /> Executing…
              </Badge>
            )}
            {result?.mode === 'DEMO' && (
              <Badge variant="outline" className="text-amber-600 border-amber-300 bg-amber-50 font-semibold">
                DEMO / SIMULATED
              </Badge>
            )}
            {result?.mode === 'SNOWFLAKE' && isSuccess && (
              <Badge variant="outline" className="text-green-700 border-green-300 bg-green-50 font-semibold">
                SNOWFLAKE
              </Badge>
            )}
          </div>
        </div>

        {/* Timeline */}
        <Card className="p-5 bg-white border border-gray-200">
          <h3 className="text-sm font-semibold text-gray-700 mb-4">Execution Timeline</h3>
          <div className="space-y-3">
            {TIMELINE_STEPS.filter((step) => {
              const done = job.auditEvents.some((e) => e.event === step.key)
              const isCurrent = step.key === 'EXECUTING' && isExecuting
              return done || isCurrent
            }).map((step) => {
              const done = job.auditEvents.some((e) => e.event === step.key)
              return (
                <div key={step.key} className="flex items-center gap-3">
                  {done ? (
                    <CheckCircle2 className="w-4 h-4 text-green-500 flex-shrink-0" />
                  ) : (
                    <RefreshCw className="w-4 h-4 text-blue-500 animate-spin flex-shrink-0" />
                  )}
                  <span className="text-sm text-gray-700">{step.label}</span>
                </div>
              )
            })}
          </div>
        </Card>

        {/* Success banner */}
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

        {/* Failure banner */}
        {isFailed && result && (
          <Card className="p-6 border border-red-200 bg-red-50">
            <div className="flex items-start gap-3">
              <XCircle className="w-6 h-6 text-red-600 flex-shrink-0 mt-0.5" />
              <div className="flex-1 space-y-3">
                <div>
                  <p className="font-semibold text-red-800">EXECUTION FAILED</p>
                  <p className="text-sm text-red-700 mt-1 whitespace-pre-wrap">{result.message}</p>
                </div>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={retryExecute}
                  disabled={executing}
                  className="border-red-300 text-red-700 hover:bg-red-100"
                >
                  {executing ? (
                    <><RefreshCw className="w-3 h-3 mr-2 animate-spin" />Retrying…</>
                  ) : (
                    <><RefreshCw className="w-3 h-3 mr-2" />Retry Execution</>
                  )}
                </Button>
              </div>
            </div>
          </Card>
        )}

        {/* Audit trail */}
        <Card className="p-5 bg-white border border-gray-200">
          <h3 className="text-sm font-semibold text-gray-700 mb-4">Audit Trail</h3>
          <div className="space-y-2">
            {job.auditEvents.map((evt, i) => (
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
        {job.generatedSql && (
          <Card className="p-5 bg-white border border-gray-200">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-semibold text-gray-700">Generated DDL</h3>
            </div>
            <pre className="text-xs font-mono bg-gray-50 rounded p-4 border text-gray-800 whitespace-pre-wrap overflow-auto max-h-80">
              {job.generatedSql}
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
