'use client'

import { useState, useEffect, useCallback } from 'react'
import { PageHeader } from '@/components/common/PageHeader'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Plus, Trash2, ToggleLeft, ToggleRight } from 'lucide-react'
import { Skill, SkillCategory } from '@/lib/skills/types'

const CATEGORY_COLORS: Record<SkillCategory, string> = {
  ORG_CONTEXT: 'bg-purple-100 text-purple-700 border-purple-300',
  COLUMN_NAMING: 'bg-blue-100 text-blue-700 border-blue-300',
  DATA_TYPE_RULE: 'bg-green-100 text-green-700 border-green-300',
  PERIOD_FORMAT: 'bg-orange-100 text-orange-700 border-orange-300',
  STRUCTURE_RULE: 'bg-rose-100 text-rose-700 border-rose-300',
}

const SOURCE_COLORS: Record<Skill['source'], string> = {
  MANUAL: 'bg-gray-100 text-gray-600 border-gray-300',
  AI_SUGGESTED: 'bg-sky-100 text-sky-700 border-sky-300',
  CONFIRMED: 'bg-emerald-100 text-emerald-700 border-emerald-300',
}

const CATEGORIES: SkillCategory[] = [
  'ORG_CONTEXT',
  'COLUMN_NAMING',
  'DATA_TYPE_RULE',
  'PERIOD_FORMAT',
  'STRUCTURE_RULE',
]

interface NewSkillForm {
  name: string
  category: SkillCategory
  rule: string
  examples: string
}

const EMPTY_FORM: NewSkillForm = {
  name: '',
  category: 'STRUCTURE_RULE',
  rule: '',
  examples: '',
}

export default function SkillsPage() {
  const [skills, setSkills] = useState<Skill[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState<NewSkillForm>(EMPTY_FORM)
  const [saving, setSaving] = useState(false)

  const loadSkills = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/skills')
      const data = await res.json()
      setSkills(data)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    loadSkills()
  }, [loadSkills])

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    try {
      const examples = form.examples
        .split('\n')
        .map((l) => l.trim())
        .filter(Boolean)
      await fetch('/api/skills', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: form.name,
          category: form.category,
          rule: form.rule,
          examples: examples.length > 0 ? examples : undefined,
          source: 'MANUAL',
        }),
      })
      setForm(EMPTY_FORM)
      setShowForm(false)
      await loadSkills()
    } finally {
      setSaving(false)
    }
  }

  async function toggleEnabled(skill: Skill) {
    await fetch(`/api/skills/${skill.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ enabled: !skill.enabled }),
    })
    setSkills((prev) =>
      prev.map((s) => (s.id === skill.id ? { ...s, enabled: !s.enabled } : s))
    )
  }

  async function handleDelete(id: string) {
    await fetch(`/api/skills/${id}`, { method: 'DELETE' })
    setSkills((prev) => prev.filter((s) => s.id !== id))
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <PageHeader subtitle="Skill Library" />
      <main className="max-w-4xl mx-auto px-6 py-8">
        <div className="flex items-start justify-between mb-6">
          <div>
            <h1 className="text-2xl font-semibold text-gray-900">Skill Library</h1>
            <p className="mt-1 text-sm text-gray-500">
              Reusable rules injected into every AI inference call
            </p>
          </div>
          <Button
            onClick={() => setShowForm((v) => !v)}
            size="sm"
            className="flex items-center gap-1.5"
          >
            <Plus className="w-4 h-4" />
            Add Skill
          </Button>
        </div>

        {showForm && (
          <Card className="mb-6 border-blue-200 bg-blue-50/40">
            <CardHeader className="pb-3">
              <CardTitle className="text-base">New Skill</CardTitle>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleCreate} className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <Label htmlFor="skill-name">Name</Label>
                    <Input
                      id="skill-name"
                      value={form.name}
                      onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                      placeholder="Short descriptive name"
                      required
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="skill-category">Category</Label>
                    <select
                      id="skill-category"
                      value={form.category}
                      onChange={(e) => setForm((f) => ({ ...f, category: e.target.value as SkillCategory }))}
                      className="w-full h-9 rounded-md border border-input bg-white px-3 py-1 text-sm shadow-sm focus:outline-none focus:ring-1 focus:ring-ring"
                    >
                      {CATEGORIES.map((c) => (
                        <option key={c} value={c}>{c}</option>
                      ))}
                    </select>
                  </div>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="skill-rule">Rule</Label>
                  <textarea
                    id="skill-rule"
                    value={form.rule}
                    onChange={(e) => setForm((f) => ({ ...f, rule: e.target.value }))}
                    placeholder="The rule text that will be injected into prompts"
                    required
                    rows={3}
                    className="w-full rounded-md border border-input bg-white px-3 py-2 text-sm shadow-sm focus:outline-none focus:ring-1 focus:ring-ring resize-none"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="skill-examples">Examples (one per line, optional)</Label>
                  <textarea
                    id="skill-examples"
                    value={form.examples}
                    onChange={(e) => setForm((f) => ({ ...f, examples: e.target.value }))}
                    placeholder="Example 1&#10;Example 2"
                    rows={2}
                    className="w-full rounded-md border border-input bg-white px-3 py-2 text-sm shadow-sm focus:outline-none focus:ring-1 focus:ring-ring resize-none"
                  />
                </div>
                <div className="flex gap-2 justify-end">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => { setShowForm(false); setForm(EMPTY_FORM) }}
                  >
                    Cancel
                  </Button>
                  <Button type="submit" size="sm" disabled={saving}>
                    {saving ? 'Saving…' : 'Save Skill'}
                  </Button>
                </div>
              </form>
            </CardContent>
          </Card>
        )}

        {loading ? (
          <div className="text-sm text-gray-500 py-12 text-center">Loading skills…</div>
        ) : skills.length === 0 ? (
          <div className="text-center py-16 text-gray-400">
            <p className="text-sm">No skills yet. Add your first rule above.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {skills.map((skill) => (
              <Card
                key={skill.id}
                className={`transition-opacity ${skill.enabled ? '' : 'opacity-50'}`}
              >
                <CardContent className="py-4 px-5">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap mb-1.5">
                        <span className="text-sm font-medium text-gray-900">{skill.name}</span>
                        <Badge
                          variant="outline"
                          className={`text-xs ${CATEGORY_COLORS[skill.category]}`}
                        >
                          {skill.category}
                        </Badge>
                        <Badge
                          variant="outline"
                          className={`text-xs ${SOURCE_COLORS[skill.source]}`}
                        >
                          {skill.source}
                        </Badge>
                        {skill.usageCount > 0 && (
                          <span className="text-xs text-gray-400">
                            used {skill.usageCount}×
                          </span>
                        )}
                      </div>
                      <p className="text-sm text-gray-700 leading-snug">{skill.rule}</p>
                      {skill.examples && skill.examples.length > 0 && (
                        <ul className="mt-1.5 space-y-0.5">
                          {skill.examples.map((ex, i) => (
                            <li key={i} className="text-xs text-gray-500 italic">
                              {ex}
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                    <div className="flex items-center gap-1 flex-shrink-0">
                      <button
                        onClick={() => toggleEnabled(skill)}
                        className="p-1.5 rounded hover:bg-gray-100 text-gray-500 hover:text-gray-700 transition-colors"
                        title={skill.enabled ? 'Disable' : 'Enable'}
                      >
                        {skill.enabled
                          ? <ToggleRight className="w-5 h-5 text-blue-600" />
                          : <ToggleLeft className="w-5 h-5" />
                        }
                      </button>
                      <button
                        onClick={() => handleDelete(skill.id)}
                        className="p-1.5 rounded hover:bg-red-50 text-gray-400 hover:text-red-500 transition-colors"
                        title="Delete"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </main>
    </div>
  )
}
