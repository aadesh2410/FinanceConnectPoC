# Finance Connect POC — API Contract & Type Reference

---

## API Routes

All routes are Next.js Route Handlers under `app/api/`.
All routes run on Node.js runtime (`export const runtime = 'nodejs'`).
No route exposes credentials or raw LLM output.

---

### POST /api/analyze

Upload an Excel workbook and trigger full pipeline (parse → detect → infer schema).

**Request:** `multipart/form-data`
```
file: <xlsx binary>
```

**Response 200:**
```json
{
  "jobId": "job_abc123",
  "status": "SCHEMA_GENERATED",
  "workbookSummary": {
    "fileName": "RWA_EUC_Demo.xlsx",
    "fileSize": 1843200,
    "sheetCount": 6,
    "candidateTableCount": 4,
    "totalProposedColumns": 38,
    "lowConfidenceFieldCount": 5,
    "formulaRegionCount": 12,
    "schemaReadinessScore": 0.91,
    "aiMode": "mock"
  },
  "schema": { ...WorkbookSchema }
}
```

**Errors:**
- `400` — not an xlsx file
- `400` — empty / unreadable workbook
- `413` — file over 10 MB

---

### GET /api/jobs/[jobId]

Fetch current job state. Used to poll status and retrieve schema for review page.

**Response 200:**
```json
{
  "jobId": "job_abc123",
  "fileName": "RWA_EUC_Demo.xlsx",
  "createdAt": "2026-01-31T10:32:11Z",
  "status": "UNDER_REVIEW",
  "workbookSummary": { ... },
  "proposedSchema": { ...WorkbookSchema },
  "approvedSchema": null,
  "generatedSql": null,
  "executionMode": "DEMO",
  "executionResult": null,
  "auditEvents": [
    { "timestamp": "2026-01-31T10:32:11Z", "event": "FILE_UPLOADED", "actor": "Demo User", "details": "RWA_EUC_Demo.xlsx" },
    { "timestamp": "2026-01-31T10:32:13Z", "event": "WORKBOOK_ANALYZED", "actor": "System", "details": "6 sheets, 4 candidate regions" },
    { "timestamp": "2026-01-31T10:32:19Z", "event": "SCHEMA_GENERATED", "actor": "AI", "details": "Mock provider | 4 tables | 38 columns" }
  ]
}
```

**Errors:**
- `404` — job not found

---

### PUT /api/jobs/[jobId]/schema

Save human edits to the schema. Called on every user save action during review.

**Request body:**
```json
{ "schema": { ...WorkbookSchema } }
```

**Server validates with Zod before storing.**

**Response 200:**
```json
{ "status": "MODIFIED", "schema": { ...WorkbookSchema } }
```

**Errors:**
- `400` — Zod validation failure with field-level errors
- `404` — job not found

---

### POST /api/jobs/[jobId]/generate-sql

Generate deterministic DDL from the current schema. No LLM involved.

**Request body:**
```json
{ "includeLineageColumns": true }
```

**Response 200:**
```json
{
  "sql": "CREATE TABLE FINANCE_POC.EUC_SANDBOX.TRADE_EXPOSURE (\n    TRADE_ID VARCHAR(50) NOT NULL,\n    ...\n);",
  "tableCount": 4,
  "generatedAt": "2026-01-31T10:33:40Z"
}
```

---

### POST /api/jobs/[jobId]/approve

Validate schema and mark job as approved. Gate before execution.

**Request body:** `{}` (empty — uses schema already stored on job)

**Validation rules applied:**
- Table name: `/^[A-Z][A-Z0-9_]{0,254}$/`
- Column name: `/^[A-Z][A-Z0-9_]{0,254}$/`, no duplicates within a table
- Data type: must be in `['VARCHAR','NUMBER','INTEGER','FLOAT','BOOLEAN','DATE','TIMESTAMP']`
- VARCHAR: length must be 1–65535
- NUMBER: precision 1–38, scale 0–precision
- At least one column per table
- At least one table in schema

**Response 200:**
```json
{ "status": "APPROVED", "approvedAt": "2026-01-31T10:34:01Z" }
```

**Errors:**
- `400` — validation errors:
```json
{
  "error": "Schema validation failed",
  "validationErrors": [
    { "table": "TRADE_EXPOSURE", "column": "EXPOSURE", "field": "precision", "message": "precision must be > 0" }
  ]
}
```

---

### POST /api/jobs/[jobId]/execute

Execute (or simulate) the approved DDL.

**Guard:** Rejects with `403` if `job.status !== 'APPROVED'`.

**Request body:** `{}` (empty)

**Response 200 (Demo Mode):**
```json
{
  "status": "CREATED",
  "executionResult": {
    "mode": "DEMO",
    "success": true,
    "database": "FINANCE_POC",
    "schema": "EUC_SANDBOX",
    "tables": ["TRADE_EXPOSURE", "COUNTERPARTY", "RWA_SUMMARY", "PARAMETERS"],
    "simulatedAt": "2026-01-31T10:34:04Z",
    "message": "Table creation simulated successfully."
  }
}
```

**Errors:**
- `403` — schema not approved
- `500` — Snowflake error (real mode only)

---

## Core TypeScript Types

```typescript
// lib/schema/types.ts

export type SnowflakeDataType =
  | 'VARCHAR'
  | 'NUMBER'
  | 'INTEGER'
  | 'FLOAT'
  | 'BOOLEAN'
  | 'DATE'
  | 'TIMESTAMP'

export type TableType = 'TRANSACTIONAL' | 'LOOKUP' | 'SUMMARY' | 'CROSSTAB'

export type JobStatus =
  | 'UPLOADED'
  | 'ANALYZING'
  | 'SCHEMA_GENERATED'
  | 'UNDER_REVIEW'
  | 'MODIFIED'
  | 'APPROVED'
  | 'EXECUTING'
  | 'CREATED'
  | 'FAILED'

export interface ColumnSchema {
  name: string
  sourceColumn: string
  sourceRange: string
  dataType: SnowflakeDataType
  length?: number
  precision?: number
  scale?: number
  nullable: boolean
  description?: string
  confidence: number          // 0-1
  evidence: string[]
  userModified?: boolean      // true if human edited this column
  userRejected?: boolean      // true if human deleted AI suggestion (kept for audit)
}

export interface TableSchema {
  tableName: string
  description: string
  sourceSheet: string
  sourceRange: string
  tableType: TableType
  confidence: number
  columns: ColumnSchema[]
  userRejected?: boolean
}

export interface WorkbookSchema {
  workbookName: string
  tables: TableSchema[]
}

export interface WorkbookSummary {
  fileName: string
  fileSize: number
  sheetCount: number
  candidateTableCount: number
  totalProposedColumns: number
  lowConfidenceFieldCount: number
  formulaRegionCount: number
  schemaReadinessScore: number
  aiMode: 'mock' | 'claude'
  sheets: SheetSummary[]
}

export interface SheetSummary {
  name: string
  rowCount: number
  colCount: number
  candidateRegionCount: number
  confidence: number
  classification: 'TRANSACTIONAL' | 'LOOKUP' | 'SUMMARY' | 'UNKNOWN'
}

export interface AuditEvent {
  timestamp: string
  event: string
  actor: 'Demo User' | 'System' | 'AI'
  details: string
}

export interface ExecutionResult {
  mode: 'DEMO' | 'SNOWFLAKE'
  success: boolean
  database: string
  schema: string
  tables: string[]
  simulatedAt?: string
  queryId?: string
  message: string
}

export interface Job {
  jobId: string
  fileName: string
  createdAt: string
  status: JobStatus
  workbookSummary: WorkbookSummary
  proposedSchema: WorkbookSchema
  approvedSchema: WorkbookSchema | null
  generatedSql: string | null
  executionMode: 'DEMO' | 'SNOWFLAKE'
  executionResult: ExecutionResult | null
  auditEvents: AuditEvent[]
}
```

---

## SchemaInferenceProvider Interface

```typescript
// lib/ai/provider.ts

export interface SchemaInferenceProvider {
  inferSchema(input: WorkbookAnalysis): Promise<WorkbookSchema>
}
```

Implementations:
- `lib/ai/mock-provider.ts` — `MockSchemaInferenceProvider`
- `lib/ai/claude-provider.ts` — `ClaudeSchemaInferenceProvider`

Selected by environment:
```typescript
const provider: SchemaInferenceProvider =
  process.env.AI_MODE === 'claude'
    ? new ClaudeSchemaInferenceProvider()
    : new MockSchemaInferenceProvider()
```

---

## Prompt Versioning

```typescript
// lib/ai/prompts.ts

export const SCHEMA_PROMPT_VERSION = 'v1'

export const SCHEMA_SYSTEM_PROMPT = `
You are a financial data modeling assistant.
...
` // cached via Anthropic prompt caching
```

The version is stored in the job audit log so schema changes can be traced to prompt changes.

---

## Project File Structure

```
finance-connect-ai-poc/
│
├── app/
│   ├── page.tsx                          ← Landing / Upload
│   ├── jobs/
│   │   └── [jobId]/
│   │       ├── page.tsx                  ← Workbook Analysis
│   │       ├── review/
│   │       │   └── page.tsx              ← Schema Review (main screen)
│   │       └── result/
│   │           └── page.tsx              ← Execution Result
│   └── api/
│       ├── analyze/
│       │   └── route.ts
│       └── jobs/
│           └── [jobId]/
│               ├── route.ts              ← GET job
│               ├── schema/
│               │   └── route.ts          ← PUT schema
│               ├── generate-sql/
│               │   └── route.ts
│               ├── approve/
│               │   └── route.ts
│               └── execute/
│                   └── route.ts
│
├── components/
│   ├── upload/
│   │   ├── DropZone.tsx
│   │   └── WorkbookPreview.tsx
│   ├── workbook/
│   │   ├── WorkbookSummaryCard.tsx
│   │   ├── SheetCard.tsx
│   │   └── SheetGrid.tsx
│   ├── schema/
│   │   ├── TableSidebar.tsx             ← Left pane: list of detected tables
│   │   ├── TableSchemaPane.tsx          ← Right pane: columns for selected table
│   │   ├── ColumnRow.tsx
│   │   ├── ColumnEditModal.tsx
│   │   ├── EvidencePanel.tsx
│   │   └── LineageModal.tsx
│   ├── sql/
│   │   ├── SqlPreview.tsx
│   │   └── ApprovalDialog.tsx
│   ├── result/
│   │   ├── ExecutionTimeline.tsx
│   │   └── ResultBanner.tsx
│   ├── audit/
│   │   └── AuditTrail.tsx
│   └── common/
│       ├── StatusBadge.tsx
│       ├── ConfidenceBar.tsx
│       └── PageHeader.tsx
│
├── lib/
│   ├── excel/
│   │   ├── parser.ts                    ← ExcelJS workbook → WorkbookAnalysis
│   │   ├── region-detector.ts           ← Heuristic region detection
│   │   └── workbook-analyzer.ts         ← Orchestrates parser + detector
│   ├── ai/
│   │   ├── provider.ts                  ← Interface
│   │   ├── mock-provider.ts
│   │   ├── claude-provider.ts           ← Anthropic SDK + prompt caching
│   │   └── prompts.ts                   ← Versioned system prompt
│   ├── schema/
│   │   ├── types.ts                     ← All TypeScript types
│   │   ├── zod-schemas.ts               ← Zod validators
│   │   ├── validation.ts                ← Approval-time validation
│   │   └── sql-generator.ts             ← Deterministic DDL generation
│   ├── jobs/
│   │   └── job-store.ts                 ← Upstash Redis CRUD for Job records
│   └── snowflake/
│       └── client.ts                    ← Stub (future integration)
│
├── public/
│   └── demo/
│       └── RWA_EUC_Demo.xlsx
│
├── types/
│   └── index.ts                         ← Re-exports from lib/schema/types.ts
│
├── docs/
│   ├── ARCHITECTURE.md
│   ├── DATA_FLOW.md
│   └── API_CONTRACT.md
│
├── .env.example
├── package.json
├── tsconfig.json
├── tailwind.config.ts
└── README.md
```
