import { Badge } from '@/components/ui/badge'

interface PageHeaderProps {
  subtitle?: string
}

export function PageHeader({ subtitle }: PageHeaderProps) {
  return (
    <header className="border-b border-gray-200 bg-white px-6 py-3">
      <div className="max-w-7xl mx-auto flex items-center justify-between">
        <div>
          <span className="text-sm font-semibold text-gray-900 tracking-wide">Finance Connect</span>
          <span className="ml-2 text-sm text-gray-400">|</span>
          <span className="ml-2 text-sm text-gray-600">{subtitle ?? 'AI EUC Schema Discovery'}</span>
        </div>
        <Badge variant="outline" className="text-amber-600 border-amber-300 bg-amber-50 text-xs font-semibold">
          DEMO MODE
        </Badge>
      </div>
    </header>
  )
}
