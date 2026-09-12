'use client'
import { useEffect, useState, useCallback } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { ArrowRight, Loader2, AlertTriangle, Trash2, Pencil, Check, X } from 'lucide-react'
import { PageHeader } from '@/components/common/PageHeader'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/components/ui/select'
import { Job, WorkbookSchema, ColumnSchema, TableSchema, SnowflakeDataType, TableType } from '@/lib/schema/types'

const DATA_TYPES: SnowflakeDataType[] = ['VARCHAR', 'NUMBER', 'INTEGER', 'FLOAT', 'BOOLEAN', 'DATE', 'TIMESTAMP']
const TABLE_TYPES: TableType[] = ['TRANSACTIONAL', 'LOOKUP', 'SUMMARY', 'CROSSTAB']

const typeColors: Record<string, string> = {
  TRANSACTIONAL: 'bg-blue-50 text-blue-700 border-blue-200',
  LOOKUP: 'bg-purple-50 text-purple-700 border-purple-200',
  SUMMARY: 'bg-amber-50 text-amber-700 border-amber-200',
  CROSSTAB: 'bg-orange-50 text-orange-700 border-orange-200',
}

function ConfidenceBar({ value }: { value: number }) {
  const pct = Math.round(value * 100)
  const color = value >= 0.9 ? 'bg-green-400' : value >= 0.75 ? 'bg-yellow-400' : 'bg-red-400'
  return (
    <div className="flex items-center gap-2">
      <div className="w-16 h-1.5 rounded bg-gray-100">
        <div className={`h-1.5 rounded ${color}`} style={{ width: `${pct}%` }} />
      </div>
      <span className="text-xs text-gray-500">{pct}%</span>
    </div>
  )
}

type ColDraft = {
  name: string
  dataType: SnowflakeDataType
  length: string
  precision: string
  scale: string
  nullable: boolean
  description: string
}

type TableDraft = {
  tableName: string
  tableType: TableType
  description: string
}

export default function ReviewPage() {
  const params = useParams()
  const router = useRouter()
  const jobId = params.jobId as string

  const [job, setJob] = useState<Job | null>(null)
  const [loading, setLoading] = useState(true)
  const [selectedTableIdx, setSelectedTableIdx] = useState(0)
  const [schema, setSchema] = useState<WorkbookSchema | null>(null)
  const [saving, setSaving] = useState(false)
  const [sqlLoading, setSqlLoading] = useState(false)
  const [sql, setSql] = useState<string | null>(null)
  const [showSql, setShowSql] = useState(false)
  const [approving, setApproving] = useState(false)
  const [showApprovalDialog, setShowApprovalDialog] = useState(false)

  // Inline edit state
  const [editingColName, setEditingColName] = useState<string | null>(null)
  const [colDraft, setColDraft] = useState<ColDraft | null>(null)
  const [editingTable, setEditingTable] = useState(false)
  const [tableDraft, setTableDraft] = useState<TableDraft | null>(null)

  useEffect(() => {
    fetch(`/api/jobs/${jobId}`)
      .then((r) => r.json())
      .then((j: Job) => {
        setJob(j)
        setSchema(j.approvedSchema ?? j.proposedSchema)
        setLoading(false)
      })
  }, [jobId])

  const activeTables = schema?.tables.filter((t) => !t.userRejected) ?? []
  const selectedTable = activeTables[selectedTableIdx]

  const saveSchema = useCallback(async (newSchema: WorkbookSchema) => {
    setSaving(true)
    await fetch(`/api/jobs/${jobId}/schema`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ schema: newSchema }),
    })
    setSaving(false)
  }, [jobId])

  const deleteColumn = (colName: string) => {
    if (!schema) return
    const newSchema: WorkbookSchema = {
      ...schema,
      tables: schema.tables.map((t, i) =>
        i === selectedTableIdx
          ? { ...t, columns: t.columns.map((c) => c.name === colName ? { ...c, userRejected: true } : c) }
          : t
      ),
    }
    setSchema(newSchema)
    saveSchema(newSchema)
  }

  const updateColumn = (colName: string, changes: Partial<ColumnSchema>) => {
    if (!schema) return
    const newSchema: WorkbookSchema = {
      ...schema,
      tables: schema.tables.map((t, i) =>
        i === selectedTableIdx
          ? { ...t, columns: t.columns.map((c) => c.name === colName ? { ...c, ...changes, userModified: true } : c) }
          : t
      ),
    }
    setSchema(newSchema)
    saveSchema(newSchema)
  }

  const updateTable = (changes: Partial<Pick<TableSchema, 'tableName' | 'tableType' | 'description'>>) => {
    if (!schema) return
    const newSchema: WorkbookSchema = {
      ...schema,
      tables: schema.tables.map((t, i) => i === selectedTableIdx ? { ...t, ...changes } : t),
    }
    setSchema(newSchema)
    saveSchema(newSchema)
  }

  const startEditCol = (col: ColumnSchema) => {
    setEditingColName(col.name)
    setColDraft({
      name: col.name,
      dataType: col.dataType,
      length: col.length?.toString() ?? '',
      precision: col.precision?.toString() ?? '',
      scale: col.scale?.toString() ?? '',
      nullable: col.nullable,
      description: col.description ?? '',
    })
  }

  const commitColEdit = () => {
    if (!colDraft || !editingColName) return
    const changes: Partial<ColumnSchema> = {
      name: colDraft.name.trim() || editingColName,
      dataType: colDraft.dataType,
      nullable: colDraft.nullable,
      description: colDraft.description.trim() || undefined,
      length: colDraft.dataType === 'VARCHAR' ? (parseInt(colDraft.length) || undefined) : undefined,
      precision: (colDraft.dataType === 'NUMBER' || colDraft.dataType === 'FLOAT') ? (parseInt(colDraft.precision) || undefined) : undefined,
      scale: (colDraft.dataType === 'NUMBER' || colDraft.dataType === 'FLOAT') ? (parseInt(colDraft.scale) || undefined) : undefined,
    }
    updateColumn(editingColName, changes)
    setEditingColName(null)
    setColDraft(null)
  }

  const commitTableEdit = () => {
    if (!tableDraft || !selectedTable) return
    updateTable({
      tableName: tableDraft.tableName.trim() || selectedTable.tableName,
      tableType: tableDraft.tableType,
      description: tableDraft.description.trim(),
    })
    setEditingTable(false)
    setTableDraft(null)
  }

  const selectTable = (i: number) => {
    setSelectedTableIdx(i)
    setEditingColName(null)
    setColDraft(null)
    setEditingTable(false)
    setTableDraft(null)
  }

  const generateSql = useCallback(async () => {
    setSqlLoading(true)
    const res = await fetch(`/api/jobs/${jobId}/generate-sql`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ includeLineageColumns: false }),
    })
    const data = await res.json()
    setSql(data.sql)
    setShowSql(true)
    setSqlLoading(false)
  }, [jobId])

  const approve = async () => {
    setApproving(true)
    const res = await fetch(`/api/jobs/${jobId}/approve`, { method: 'POST' })
    if (res.ok) {
      router.push(`/jobs/${jobId}/result`)
    } else {
      setApproving(false)
    }
    setShowApprovalDialog(false)
  }

  const handleApproveAndCreate = async () => {
    await generateSql()
    setShowApprovalDialog(true)
  }

  if (loading) {
    return (
      <div className="min-h-screen flex flex-col">
        <PageHeader />
        <div className="flex-1 flex items-center justify-center">
          <Loader2 className="w-6 h-6 animate-spin text-gray-400" />
        </div>
      </div>
    )
  }

  if (!schema || activeTables.length === 0) {
    return (
      <div className="min-h-screen flex flex-col">
        <PageHeader />
        <div className="flex-1 flex items-center justify-center text-gray-500 text-sm">No schema data found.</div>
      </div>
    )
  }

  return (
    <div className="min-h-screen flex flex-col">
      <PageHeader />

      {/* SQL Preview Modal */}
      {showSql && sql && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-lg shadow-xl w-full max-w-3xl max-h-[80vh] flex flex-col">
            <div className="flex items-center justify-between px-5 py-4 border-b">
              <div>
                <h3 className="font-semibold text-gray-900">SQL Preview</h3>
                <p className="text-xs text-gray-500 mt-0.5">SQL generated deterministically from approved schema. LLM did not generate this SQL.</p>
              </div>
              <button onClick={() => setShowSql(false)} className="text-gray-400 hover:text-gray-600 text-xl leading-none">×</button>
            </div>
            <div className="flex-1 overflow-auto p-5">
              <pre className="text-xs font-mono bg-gray-50 rounded p-4 border text-gray-800 whitespace-pre-wrap">{sql}</pre>
            </div>
            <div className="px-5 py-4 border-t flex justify-between items-center">
              <button onClick={() => navigator.clipboard.writeText(sql)} className="text-xs text-blue-600 hover:underline">Copy SQL</button>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" onClick={() => setShowSql(false)}>Close</Button>
                <Button size="sm" onClick={() => { setShowSql(false); setShowApprovalDialog(true) }}>
                  Approve &amp; Create
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Approval Dialog */}
      {showApprovalDialog && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-lg shadow-xl w-full max-w-md p-6 space-y-4">
            <h3 className="font-semibold text-gray-900">Confirm Approval</h3>
            <p className="text-sm text-gray-600">You are about to create the following tables in the Finance Connect sandbox:</p>
            <div className="bg-gray-50 rounded p-3 space-y-1">
              {activeTables.map((t) => (
                <p key={t.tableName} className="text-sm font-mono text-gray-700">
                  FINANCE_POC.EUC_SANDBOX.{t.tableName}
                </p>
              ))}
            </div>
            <p className="text-xs text-amber-600 font-medium">No production systems will be modified. This is a sandbox demo.</p>
            <div className="flex gap-2 justify-end pt-2">
              <Button variant="outline" onClick={() => setShowApprovalDialog(false)}>Cancel</Button>
              <Button onClick={approve} disabled={approving}>
                {approving ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Approving...</> : 'Approve & Execute'}
              </Button>
            </div>
          </div>
        </div>
      )}

      <div className="flex-1 flex overflow-hidden" style={{ height: 'calc(100vh - 57px)' }}>
        {/* Left sidebar */}
        <div className="w-64 border-r border-gray-200 bg-white flex flex-col flex-shrink-0">
          <div className="px-4 py-3 border-b border-gray-100">
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Detected Tables</p>
          </div>
          <div className="flex-1 overflow-y-auto">
            {activeTables.map((table, i) => (
              <button
                key={table.tableName}
                onClick={() => selectTable(i)}
                className={`w-full text-left px-4 py-3 border-b border-gray-50 hover:bg-gray-50 transition-colors ${i === selectedTableIdx ? 'bg-blue-50 border-l-2 border-l-blue-500' : ''}`}
              >
                <p className="text-sm font-medium text-gray-900 truncate">{table.tableName}</p>
                <div className="flex items-center gap-1.5 mt-1">
                  <Badge variant="outline" className={`text-xs py-0 ${typeColors[table.tableType] ?? ''}`}>
                    {table.tableType}
                  </Badge>
                  <span className="text-xs text-gray-400">{Math.round(table.confidence * 100)}%</span>
                </div>
                <p className="text-xs text-gray-400 mt-1">{table.columns.filter(c => !c.userRejected).length} columns</p>
              </button>
            ))}
          </div>
        </div>

        {/* Right pane */}
        <div className="flex-1 flex flex-col overflow-hidden">
          {selectedTable && (
            <>
              {/* Table header */}
              <div className="px-6 py-4 border-b border-gray-200 bg-white flex items-start justify-between flex-shrink-0">
                {editingTable && tableDraft ? (
                  <div className="flex-1 space-y-2">
                    <div className="flex items-center gap-2 flex-wrap">
                      <Input
                        value={tableDraft.tableName}
                        onChange={(e) => setTableDraft({ ...tableDraft, tableName: e.target.value })}
                        className="h-8 text-sm font-semibold w-48"
                        placeholder="Table name"
                      />
                      <Select
                        value={tableDraft.tableType}
                        onValueChange={(v) => setTableDraft({ ...tableDraft, tableType: v as TableType })}
                      >
                        <SelectTrigger className="h-8 text-xs w-40">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {TABLE_TYPES.map((t) => (
                            <SelectItem key={t} value={t} className="text-xs">{t}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <Input
                      value={tableDraft.description}
                      onChange={(e) => setTableDraft({ ...tableDraft, description: e.target.value })}
                      className="h-7 text-xs"
                      placeholder="Table description"
                    />
                    <div className="flex gap-1.5">
                      <Button size="sm" className="h-7 px-2 text-xs" onClick={commitTableEdit} disabled={saving}>
                        {saving ? <Loader2 className="w-3 h-3 animate-spin" /> : <Check className="w-3 h-3 mr-1" />} Save
                      </Button>
                      <Button size="sm" variant="ghost" className="h-7 px-2 text-xs" onClick={() => { setEditingTable(false); setTableDraft(null) }}>
                        <X className="w-3 h-3 mr-1" /> Cancel
                      </Button>
                    </div>
                  </div>
                ) : (
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <h2 className="text-lg font-semibold text-gray-900">{selectedTable.tableName}</h2>
                      <Badge variant="outline" className={`text-xs ${typeColors[selectedTable.tableType] ?? ''}`}>
                        {selectedTable.tableType}
                      </Badge>
                      <button
                        onClick={() => {
                          setEditingTable(true)
                          setTableDraft({
                            tableName: selectedTable.tableName,
                            tableType: selectedTable.tableType,
                            description: selectedTable.description,
                          })
                        }}
                        className="p-1 text-gray-400 hover:text-blue-500 hover:bg-blue-50 rounded transition-colors"
                        title="Edit table"
                      >
                        <Pencil className="w-3.5 h-3.5" />
                      </button>
                    </div>
                    <p className="text-xs text-gray-500 mt-1">{selectedTable.sourceSheet} · {selectedTable.sourceRange}</p>
                    <p className="text-xs text-gray-400 mt-0.5">{selectedTable.description}</p>
                  </div>
                )}
                <div className="flex items-center gap-2 flex-shrink-0 ml-4">
                  <span className="text-sm text-gray-500">Confidence: {Math.round(selectedTable.confidence * 100)}%</span>
                </div>
              </div>

              {/* Column list */}
              <div className="flex-1 overflow-y-auto p-6">
                <div className="space-y-2">
                  {selectedTable.columns.filter(c => !c.userRejected).map((col) => (
                    <Card
                      key={col.name}
                      className={`p-4 bg-white border transition-all ${
                        col.confidence < 0.8 ? 'border-amber-200' : 'border-gray-200'
                      } ${editingColName === col.name ? 'ring-2 ring-blue-300 border-blue-200' : ''}`}
                    >
                      {editingColName === col.name && colDraft ? (
                        /* ── EDIT MODE ── */
                        <div className="space-y-3">
                          {/* Row 1: name + data type */}
                          <div className="flex gap-2">
                            <div className="flex-1">
                              <label className="text-xs text-gray-500 mb-1 block">Column Name</label>
                              <Input
                                value={colDraft.name}
                                onChange={(e) => setColDraft({ ...colDraft, name: e.target.value })}
                                className="h-7 text-xs font-mono"
                                placeholder="COLUMN_NAME"
                              />
                            </div>
                            <div className="w-40">
                              <label className="text-xs text-gray-500 mb-1 block">Data Type</label>
                              <Select
                                value={colDraft.dataType}
                                onValueChange={(v) => setColDraft({
                                  ...colDraft,
                                  dataType: v as SnowflakeDataType,
                                  length: '', precision: '', scale: '',
                                })}
                              >
                                <SelectTrigger className="h-7 text-xs">
                                  <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                  {DATA_TYPES.map((dt) => (
                                    <SelectItem key={dt} value={dt} className="text-xs font-mono">{dt}</SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            </div>
                          </div>

                          {/* Row 2: conditional numeric params */}
                          {colDraft.dataType === 'VARCHAR' && (
                            <div className="flex gap-2">
                              <div className="w-28">
                                <label className="text-xs text-gray-500 mb-1 block">Length</label>
                                <Input
                                  type="number" min={1}
                                  value={colDraft.length}
                                  onChange={(e) => setColDraft({ ...colDraft, length: e.target.value })}
                                  className="h-7 text-xs" placeholder="255"
                                />
                              </div>
                            </div>
                          )}
                          {(colDraft.dataType === 'NUMBER' || colDraft.dataType === 'FLOAT') && (
                            <div className="flex gap-2">
                              <div className="w-28">
                                <label className="text-xs text-gray-500 mb-1 block">Precision</label>
                                <Input
                                  type="number" min={1}
                                  value={colDraft.precision}
                                  onChange={(e) => setColDraft({ ...colDraft, precision: e.target.value })}
                                  className="h-7 text-xs" placeholder="18"
                                />
                              </div>
                              <div className="w-28">
                                <label className="text-xs text-gray-500 mb-1 block">Scale</label>
                                <Input
                                  type="number" min={0}
                                  value={colDraft.scale}
                                  onChange={(e) => setColDraft({ ...colDraft, scale: e.target.value })}
                                  className="h-7 text-xs" placeholder="2"
                                />
                              </div>
                            </div>
                          )}

                          {/* Row 3: nullable toggle */}
                          <div className="flex items-center gap-2">
                            <span className="text-xs text-gray-500">Nullable</span>
                            <button
                              type="button"
                              onClick={() => setColDraft({ ...colDraft, nullable: !colDraft.nullable })}
                              className={`px-2 py-0.5 rounded text-xs font-medium transition-colors ${
                                colDraft.nullable
                                  ? 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                                  : 'bg-gray-900 text-white hover:bg-gray-700'
                              }`}
                            >
                              {colDraft.nullable ? 'NULL' : 'NOT NULL'}
                            </button>
                          </div>

                          {/* Row 4: description */}
                          <div>
                            <label className="text-xs text-gray-500 mb-1 block">Description</label>
                            <Input
                              value={colDraft.description}
                              onChange={(e) => setColDraft({ ...colDraft, description: e.target.value })}
                              className="h-7 text-xs"
                              placeholder="Optional description"
                            />
                          </div>

                          {/* Row 5: actions */}
                          <div className="flex gap-1.5 justify-end pt-1 border-t border-gray-100">
                            <Button
                              size="sm" variant="ghost"
                              className="h-7 px-2 text-xs text-gray-500"
                              onClick={() => { setEditingColName(null); setColDraft(null) }}
                            >
                              <X className="w-3 h-3 mr-1" /> Cancel
                            </Button>
                            <Button
                              size="sm" className="h-7 px-2 text-xs"
                              onClick={commitColEdit}
                              disabled={saving}
                            >
                              {saving
                                ? <Loader2 className="w-3 h-3 animate-spin" />
                                : <><Check className="w-3 h-3 mr-1" /> Save</>
                              }
                            </Button>
                          </div>
                        </div>
                      ) : (
                        /* ── VIEW MODE ── */
                        <div className="flex items-start justify-between gap-4">
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              {col.confidence < 0.8 && <AlertTriangle className="w-3.5 h-3.5 text-amber-500 flex-shrink-0" />}
                              <p className="text-sm font-semibold text-gray-900 font-mono">{col.name}</p>
                              {col.userModified && (
                                <span className="text-xs text-blue-500 font-medium">edited</span>
                              )}
                            </div>
                            <div className="flex items-center gap-3 mt-1 flex-wrap">
                              <span className="text-xs text-blue-700 font-mono bg-blue-50 px-1.5 py-0.5 rounded">
                                {col.dataType}{col.length ? `(${col.length})` : ''}{col.precision ? `(${col.precision},${col.scale ?? 0})` : ''}
                              </span>
                              <span className={`text-xs px-1.5 py-0.5 rounded ${col.nullable ? 'bg-gray-50 text-gray-500' : 'bg-gray-900 text-white'}`}>
                                {col.nullable ? 'NULL' : 'NOT NULL'}
                              </span>
                            </div>
                            {col.description && (
                              <p className="text-xs text-gray-400 mt-1 italic">{col.description}</p>
                            )}
                            {col.evidence.length > 0 && (
                              <ul className="mt-2 space-y-0.5">
                                {col.evidence.map((e, i) => (
                                  <li key={i} className="text-xs text-gray-500 flex items-start gap-1">
                                    <span className="text-green-500 flex-shrink-0">•</span>
                                    {e}
                                  </li>
                                ))}
                              </ul>
                            )}
                          </div>
                          <div className="flex flex-col items-end gap-2 flex-shrink-0">
                            <ConfidenceBar value={col.confidence} />
                            <div className="flex gap-1">
                              <button
                                onClick={() => startEditCol(col)}
                                className="p-1.5 text-gray-400 hover:text-blue-500 hover:bg-blue-50 rounded transition-colors"
                                title="Edit column"
                              >
                                <Pencil className="w-3.5 h-3.5" />
                              </button>
                              <button
                                onClick={() => deleteColumn(col.name)}
                                className="p-1.5 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded transition-colors"
                                title="Delete column"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          </div>
                        </div>
                      )}
                    </Card>
                  ))}
                </div>
              </div>

              {/* Bottom actions */}
              <div className="px-6 py-4 border-t border-gray-200 bg-white flex items-center justify-between flex-shrink-0">
                <div className="flex items-center gap-2 text-xs text-gray-500">
                  {saving && <><Loader2 className="w-3 h-3 animate-spin" />Saving...</>}
                </div>
                <div className="flex gap-2">
                  <Button variant="outline" size="sm" onClick={generateSql} disabled={sqlLoading}>
                    {sqlLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Preview SQL'}
                  </Button>
                  <Button size="sm" onClick={handleApproveAndCreate} disabled={sqlLoading || approving}>
                    Approve &amp; Create <ArrowRight className="w-4 h-4 ml-1" />
                  </Button>
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
