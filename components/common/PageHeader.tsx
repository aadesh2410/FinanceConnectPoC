'use client'

import { usePathname } from 'next/navigation'
import Link from 'next/link'
import { ChevronRight, BookOpen } from 'lucide-react'
import { Badge } from '@/components/ui/badge'

interface PageHeaderProps {
  subtitle?: string
}

type Step = 'upload' | 'analyze' | 'review' | 'execute'

const FLOW: { key: Step; label: string }[] = [
  { key: 'upload', label: 'Upload' },
  { key: 'analyze', label: 'Analyze' },
  { key: 'review', label: 'Review' },
  { key: 'execute', label: 'Execute' },
]

function currentStep(pathname: string | null): Step {
  if (!pathname) return 'upload'
  if (pathname.endsWith('/result')) return 'execute'
  if (pathname.endsWith('/review')) return 'review'
  if (pathname.startsWith('/jobs/')) return 'analyze'
  return 'upload'
}

export function PageHeader({ subtitle }: PageHeaderProps) {
  const pathname = usePathname()
  const active = currentStep(pathname)
  const activeIdx = FLOW.findIndex((s) => s.key === active)

  return (
    <header className="border-b border-gray-200 bg-white px-6 py-3">
      <div className="max-w-7xl mx-auto flex items-center justify-between gap-6">
        <div className="flex-shrink-0">
          <span className="text-sm font-semibold text-gray-900 tracking-wide">Finance Connect</span>
          <span className="ml-2 text-sm text-gray-400">|</span>
          <span className="ml-2 text-sm text-gray-600">{subtitle ?? 'AI EUC Schema Discovery'}</span>
        </div>

        {/* Flow indicator */}
        <nav className="hidden md:flex items-center gap-1 text-xs font-medium">
          {FLOW.map((step, i) => {
            const isDone = i < activeIdx
            const isActive = i === activeIdx
            return (
              <span key={step.key} className="flex items-center gap-1">
                <span
                  className={`px-2 py-0.5 rounded-full ${
                    isActive
                      ? 'bg-blue-100 text-blue-700'
                      : isDone
                      ? 'text-gray-600'
                      : 'text-gray-400'
                  }`}
                >
                  {step.label}
                </span>
                {i < FLOW.length - 1 && <ChevronRight className="w-3 h-3 text-gray-300" />}
              </span>
            )
          })}
        </nav>

        <Link
          href="/skills"
          className="flex items-center gap-1 text-xs font-medium text-gray-500 hover:text-gray-800 transition-colors flex-shrink-0"
        >
          <BookOpen className="w-3.5 h-3.5" />
          Skills
        </Link>

        <Badge variant="outline" className="text-amber-600 border-amber-300 bg-amber-50 text-xs font-semibold flex-shrink-0">
          DEMO MODE
        </Badge>
      </div>
    </header>
  )
}
