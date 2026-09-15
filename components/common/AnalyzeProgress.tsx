'use client'

import { useEffect, useState } from 'react'
import { CheckCircle2, Loader2, Circle } from 'lucide-react'

interface Step {
  label: string
  detail: string
  /** approx duration in ms — used to animate progression while the real request is in flight */
  duration: number
}

const STEPS: Step[] = [
  { label: 'Parsing workbook', detail: 'Reading sheets, cells, and named ranges', duration: 2500 },
  { label: 'Detecting table regions', detail: 'Finding headers, data blocks, and formulas', duration: 2500 },
  { label: 'Inferring schema with AI', detail: 'Claude is proposing tables, columns, and data types', duration: 12000 },
  { label: 'Finalizing', detail: 'Computing confidence and readiness score', duration: 1500 },
]

interface AnalyzeProgressProps {
  /** When true, animate through steps. When false, everything is idle/hidden. */
  active: boolean
  /** When true, snap all steps to done. */
  done?: boolean
}

export function AnalyzeProgress({ active, done }: AnalyzeProgressProps) {
  const [current, setCurrent] = useState(0)

  useEffect(() => {
    if (!active) { setCurrent(0); return }
    if (done) { setCurrent(STEPS.length); return }

    let idx = 0
    setCurrent(0)
    const advance = () => {
      idx += 1
      if (idx >= STEPS.length - 1) return // hold on the last step until `done` fires
      setCurrent(idx)
      timer = setTimeout(advance, STEPS[idx].duration)
    }
    let timer = setTimeout(advance, STEPS[0].duration)
    return () => clearTimeout(timer)
  }, [active, done])

  if (!active) return null

  return (
    <div className="border border-gray-200 bg-white rounded-lg p-5 space-y-3">
      <p className="text-sm font-semibold text-gray-700">Analyzing your workbook…</p>
      <ul className="space-y-2.5">
        {STEPS.map((step, i) => {
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
