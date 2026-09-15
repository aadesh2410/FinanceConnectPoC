'use client'
import { useState, useRef, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { Upload, FileSpreadsheet, Loader2, AlertCircle, Info } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { PageHeader } from '@/components/common/PageHeader'
import { AnalyzeProgress } from '@/components/common/AnalyzeProgress'

export default function HomePage() {
  const router = useRouter()
  const [file, setFile] = useState<File | null>(null)
  const [dragging, setDragging] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [duplicateBanner, setDuplicateBanner] = useState<{
    hasChanges: boolean
    changedTableCount: number
    previousJobId: string
    newJobId: string
  } | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  const handleFile = (f: File) => {
    if (!f.name.endsWith('.xlsx')) {
      setError('Only .xlsx files are supported.')
      return
    }
    if (f.size > 10 * 1024 * 1024) {
      setError('File must be under 10 MB.')
      return
    }
    setError(null)
    setFile(f)
  }

  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setDragging(false)
    const f = e.dataTransfer.files[0]
    if (f) handleFile(f)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const onAnalyze = async () => {
    if (!file) return
    setLoading(true)
    setError(null)
    setDuplicateBanner(null)
    try {
      const form = new FormData()
      form.append('file', file)
      const res = await fetch('/api/analyze', { method: 'POST', body: form })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Analysis failed')
      if (data.duplicate) {
        setDuplicateBanner({
          hasChanges: data.schemaDiff?.hasChanges ?? false,
          changedTableCount: data.schemaDiff?.tables?.length ?? 0,
          previousJobId: data.previousJobId,
          newJobId: data.jobId,
        })
        setLoading(false)
        // Still navigate after a short pause so user sees the banner
        setTimeout(() => router.push(`/jobs/${data.jobId}`), 2500)
        return
      }
      router.push(`/jobs/${data.jobId}`)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Analysis failed')
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex flex-col">
      <PageHeader />
      <main className="flex-1 flex flex-col items-center justify-center px-4 py-16">
        <div className="w-full max-w-2xl space-y-10">
          {/* Title */}
          <div className="text-center space-y-2">
            <h1 className="text-2xl font-semibold text-gray-900 tracking-tight">
              AI EUC Schema Discovery
            </h1>
            <p className="text-gray-500 text-sm">
              Transform complex Excel EUCs into reviewable Snowflake data models.
            </p>
          </div>

          {/* Drop zone */}
          <Card
            className={`border-2 border-dashed cursor-pointer transition-colors ${
              dragging ? 'border-blue-400 bg-blue-50' : 'border-gray-200 hover:border-gray-300 bg-white'
            }`}
            onDragOver={(e) => { e.preventDefault(); setDragging(true) }}
            onDragLeave={() => setDragging(false)}
            onDrop={onDrop}
            onClick={() => inputRef.current?.click()}
          >
            <div className="flex flex-col items-center justify-center py-14 px-8 space-y-4">
              <div className="w-12 h-12 rounded-full bg-gray-100 flex items-center justify-center">
                <Upload className="w-5 h-5 text-gray-400" />
              </div>
              <div className="text-center">
                <p className="text-sm font-medium text-gray-700">Drop Excel EUC here</p>
                <p className="text-xs text-gray-400 mt-1">or click to choose file</p>
              </div>
              <Badge variant="outline" className="text-xs text-gray-500">.xlsx supported · max 10 MB</Badge>
            </div>
            <input ref={inputRef} type="file" accept=".xlsx" className="hidden" onChange={(e) => e.target.files?.[0] && handleFile(e.target.files[0])} />
          </Card>

          {/* File info */}
          {file && !loading && (
            <Card className="p-5 bg-white border border-gray-200">
              <div className="flex items-start gap-3">
                <FileSpreadsheet className="w-8 h-8 text-green-600 mt-0.5 flex-shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-900 truncate">{file.name}</p>
                  <p className="text-xs text-gray-500 mt-0.5">
                    {(file.size / 1024 / 1024).toFixed(2)} MB
                  </p>
                </div>
              </div>
              <div className="mt-4">
                <Button onClick={onAnalyze} disabled={loading} className="w-full">
                  {loading ? (
                    <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Analyzing Workbook...</>
                  ) : (
                    'Analyze Workbook'
                  )}
                </Button>
              </div>
            </Card>
          )}

          {/* Live step-by-step progress while /api/analyze is in flight */}
          <AnalyzeProgress active={loading} />

          {duplicateBanner && !duplicateBanner.hasChanges && (
            <div className="flex items-start gap-2 p-3 rounded-md border border-blue-200 bg-blue-50">
              <Info className="w-4 h-4 text-blue-600 flex-shrink-0 mt-0.5" />
              <p className="text-sm text-blue-700">
                This workbook is already registered — no schema changes detected.{' '}
                <a href={`/jobs/${duplicateBanner.previousJobId}`} className="underline font-medium">
                  View existing job?
                </a>{' '}
                (Redirecting to new job…)
              </p>
            </div>
          )}

          {duplicateBanner && duplicateBanner.hasChanges && (
            <div className="flex items-start gap-2 p-3 rounded-md border border-amber-200 bg-amber-50">
              <AlertCircle className="w-4 h-4 text-amber-600 flex-shrink-0 mt-0.5" />
              <p className="text-sm text-amber-700">
                Schema drift detected — {duplicateBanner.changedTableCount} table(s) changed. Continuing to review with diff highlighted. (Redirecting…)
              </p>
            </div>
          )}

          {error && (
            <div className="flex items-start gap-2 p-3 rounded-md border border-red-200 bg-red-50">
              <AlertCircle className="w-4 h-4 text-red-600 flex-shrink-0 mt-0.5" />
              <p className="text-sm text-red-700">{error}</p>
            </div>
          )}
        </div>
      </main>
    </div>
  )
}
