import { notFound } from 'next/navigation'
import Link from 'next/link'
import { ArrowRight, FileSpreadsheet, Table2, AlertTriangle, Code2, CheckCircle } from 'lucide-react'
import { PageHeader } from '@/components/common/PageHeader'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Job } from '@/lib/schema/types'

async function getJob(jobId: string): Promise<Job | null> {
  try {
    const baseUrl = process.env.NEXT_PUBLIC_BASE_URL ?? 'http://localhost:3000'
    const res = await fetch(`${baseUrl}/api/jobs/${jobId}`, {
      cache: 'no-store',
    })
    if (!res.ok) return null
    return res.json()
  } catch {
    return null
  }
}

const classificationColors: Record<string, string> = {
  TRANSACTIONAL: 'bg-blue-50 text-blue-700 border-blue-200',
  LOOKUP: 'bg-purple-50 text-purple-700 border-purple-200',
  SUMMARY: 'bg-amber-50 text-amber-700 border-amber-200',
  CROSSTAB: 'bg-orange-50 text-orange-700 border-orange-200',
  UNKNOWN: 'bg-gray-50 text-gray-600 border-gray-200',
}

const confidenceLabel = (c: number) => {
  if (c >= 0.9) return { label: 'High Confidence', cls: 'bg-green-50 text-green-700 border-green-200' }
  if (c >= 0.75) return { label: 'Medium Confidence', cls: 'bg-yellow-50 text-yellow-700 border-yellow-200' }
  return { label: 'Low Confidence', cls: 'bg-red-50 text-red-700 border-red-200' }
}

export default async function JobPage({ params }: { params: { jobId: string } }) {
  const job = await getJob(params.jobId)
  if (!job) notFound()

  const s = job.workbookSummary
  const readinessPct = Math.round(s.schemaReadinessScore * 100)

  return (
    <div className="min-h-screen flex flex-col">
      <PageHeader />
      <main className="flex-1 max-w-5xl mx-auto w-full px-4 py-8 space-y-8">
        {/* Header */}
        <div className="flex items-start justify-between">
          <div>
            <h2 className="text-xl font-semibold text-gray-900">Workbook Analysis</h2>
            <p className="text-sm text-gray-500 mt-1">{s.fileName}</p>
          </div>
          <Badge className="bg-green-50 text-green-700 border border-green-200 font-semibold">
            Analysis Complete
          </Badge>
        </div>

        {/* Summary stats */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
          {[
            { label: 'Sheets', value: s.sheetCount, icon: FileSpreadsheet },
            { label: 'Candidate Tables', value: s.candidateTableCount, icon: Table2 },
            { label: 'Proposed Columns', value: s.totalProposedColumns, icon: Table2 },
            { label: 'Low Confidence', value: s.lowConfidenceFieldCount, icon: AlertTriangle },
            { label: 'Formula Regions', value: s.formulaRegionCount, icon: Code2 },
            { label: 'Schema Readiness', value: `${readinessPct}%`, icon: CheckCircle },
          ].map(({ label, value }) => (
            <Card key={label} className="p-4 bg-white border border-gray-200">
              <p className="text-xs text-gray-500 font-medium">{label}</p>
              <p className="text-2xl font-bold text-gray-900 mt-1">{value}</p>
            </Card>
          ))}
        </div>

        {/* Sheet cards */}
        <div>
          <h3 className="text-sm font-semibold text-gray-700 mb-3">Detected Sheets</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {s.sheets.map((sheet) => {
              const conf = confidenceLabel(sheet.confidence)
              const cls = classificationColors[sheet.classification] ?? classificationColors.UNKNOWN
              return (
                <Card key={sheet.name} className="p-4 bg-white border border-gray-200">
                  <div className="flex items-start justify-between">
                    <p className="text-sm font-semibold text-gray-900">{sheet.name}</p>
                    <div className="flex gap-1.5 flex-wrap justify-end">
                      <Badge variant="outline" className={`text-xs ${cls}`}>{sheet.classification}</Badge>
                      <Badge variant="outline" className={`text-xs ${conf.cls}`}>{conf.label}</Badge>
                    </div>
                  </div>
                  <p className="text-xs text-gray-500 mt-2">
                    {sheet.rowCount} rows × {sheet.colCount} columns
                    {sheet.candidateRegionCount > 0 && ` · ${sheet.candidateRegionCount} candidate region${sheet.candidateRegionCount > 1 ? 's' : ''}`}
                  </p>
                  <div className="mt-2 h-1 rounded bg-gray-100">
                    <div
                      className="h-1 rounded bg-green-400"
                      style={{ width: `${Math.round(sheet.confidence * 100)}%` }}
                    />
                  </div>
                </Card>
              )
            })}
          </div>
        </div>

        {/* CTA */}
        <div className="flex justify-end">
          <Link href={`/jobs/${params.jobId}/review`}>
            <Button className="gap-2">
              Review Schema <ArrowRight className="w-4 h-4" />
            </Button>
          </Link>
        </div>
      </main>
    </div>
  )
}
