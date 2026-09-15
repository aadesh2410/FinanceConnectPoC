'use client'

import { useEffect, useState } from 'react'
import { CheckCircle2, Loader2, Circle } from 'lucide-react'

interface Step {
  label: string
  detail: string
  duration: number
}

function getSteps(aiMode: 'claude' | 'heuristic'): Step[] {
  return [
    { label: 'Parsing workbook', detail: 'Reading sheets, cells, and named ranges', duration: 2500 },
    { label: 'Detecting table regions', detail: 'Finding headers, data blocks, and formulas', duration: 2500 },
    aiMode === 'claude'
      ? { label: 'Inferring schema with Claude AI', detail: 'Claude is proposing tables, columns, and data types', duration: 12000 }
      : { label: 'Inferring schema locally', detail: 'Sampling cell values to determine column types', duration: 800 },
    { label: 'Finalizing', detail: 'Computing confidence and readiness score', duration: 1500 },
  ]
}

interface AnalyzeProgressProps {
  active: boolean
  done?: boolean
  aiMode?: 'claude' | 'heuristic'
}

export function AnalyzeProgress({ active, done, aiMode = 'claude' }: AnalyzeProgressProps) {
  const [current, setCurrent] = useState(0)
  const steps = getSteps(aiMode)

  useEffect(() => {
    if (!active) { setCurrent(0); return }
    if (done) { setCurrent(steps.length); return }

    let idx = 0
    setCurrent(0)
    const advance = () => {
      idx += 1
      if (idx >= steps.length - 1) return
      setCurrent(idx)
      timer = setTimeout(advance, steps[idx].duration)
    }
    let timer = setTimeout(advance, steps[0].duration)
    return () => clearTimeout(timer)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, done, aiMode])

  if (!active) return null

  return (
    <div className="border border-gray-200 bg-white rounded-lg p-5 space-y-3">
      <p className="text-sm font-semibold text-gray-700">Analyzing your workbook…</p>
      <ul className="space-y-2.5">
        {steps.map((step, i) => {
          const isDone = done || i < current
          const isActive = !done && i === current
          return (
            <li key={step.label} className="flex items-start gap-3">
              {isDone ? (
                <CheckCircle2 className="w-4 h-4 text-green-500 flex-shrink-0 mt-0.5" />
              ) : isActive ? (
                <Loader2 className="w-4 h-4 text-blue-500 animate-spin flex-shrink-0 mt-0.5" />
              ) : (
                <Circle className="w-4 h-4 text-gray-300 flex-shrink-0 mt-0.5" />
              )}
              <div className="flex-1 min-w-0">
                <p className={`text-sm font-medium ${isDone ? 'text-gray-700' : isActive ? 'text-gray-900' : 'text-gray-400'}`}>
                  {step.label}
                </p>
                <p className="text-xs text-gray-500">{step.detail}</p>
              </div>
            </li>
          )
        })}
      </ul>
    </div>
  )
}
