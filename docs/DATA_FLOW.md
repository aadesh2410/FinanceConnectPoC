# Finance Connect POC — Data Flow

---

## End-to-End Pipeline

```
User uploads .xlsx
       │
       ▼
┌─────────────────────────────────────────────────────┐
│  STEP 1: Excel Parsing (ExcelJS)                    │
│                                                     │
│  Input:  .xlsx binary                               │
│  Output: WorkbookAnalysis                           │
│                                                     │
│  Extracts per sheet:                                │
│  - sheet name, dimensions                           │
│  - all cell values, types, formulas                 │
│  - merged cell ranges                               │
│  - non-empty bounding boxes                         │
└─────────────────┬───────────────────────────────────┘
                  │
                  ▼
┌─────────────────────────────────────────────────────┐
│  STEP 2: Region Detection (Heuristics)              │
│                                                     │
│  Input:  WorkbookAnalysis                           │
│  Output: WorkbookAnalysis with candidateRegions     │
│                                                     │
│  Detects per sheet:                                 │
│  - title regions (large merged cells at top)        │
│  - metadata regions (key-value pairs near top)      │
│  - blank separator rows                             │
│  - candidate data regions (consistent column count) │
│  - header rows (string-dominant rows above data)    │
│  - multi-row headers (merged headers above cols)    │
│  - totals/subtotal rows (SUM formulas, bold)        │
│  - lookup tables (small, key-value or reference)    │
│  - cross-tab/pivot layouts                          │
└─────────────────┬───────────────────────────────────┘
                  │
                  ▼
┌─────────────────────────────────────────────────────┐
│  STEP 3: Schema Inference (SchemaInferenceProvider) │
│                                                     │
│  Input:  WorkbookAnalysis (with regions)            │
│  Output: WorkbookSchema (validated by Zod)          │
│                                                     │
│  MockSchemaInferenceProvider:                       │
│  - Returns pre-built realistic schema               │
│  - Matches RWA_EUC_Demo.xlsx structure              │
│  - Runs instantly, no API key needed                │
│                                                     │
│  ClaudeSchemaInferenceProvider:                     │
│  - Serializes WorkbookAnalysis to JSON              │
│  - Sends to Claude with cached system prompt        │
│  - Parses + validates response with Zod             │
│  - Falls back to heuristic on failure               │
└─────────────────┬───────────────────────────────────┘
                  │
                  ▼
┌─────────────────────────────────────────────────────┐
│  STEP 4: Job Created (Upstash Redis)                │
│                                                     │
│  Job record stored:                                 │
│  {                                                  │
│    jobId, fileName, status: SCHEMA_GENERATED,       │
│    workbookSummary, proposedSchema,                 │
│    approvedSchema: null, generatedSql: null,        │
│    auditEvents: [uploaded, analyzed, schema_gen]   │
│  }                                                  │
│                                                     │
│  Response → client: { jobId, status, schema }       │
└─────────────────┬───────────────────────────────────┘
                  │
                  ▼ (user navigates to review page)
┌─────────────────────────────────────────────────────┐
│  STEP 5: Human Review (Schema Review Screen)        │
│                                                     │
│  UI shows:                                          │
│  - Left sidebar: detected tables list               │
│  - Right pane: selected table columns               │
│  - Excel preview with source range highlighted      │
│  - Confidence + evidence per column                 │
│  - Editable fields per column                       │
│  - Explainable AI panel                             │
│                                                     │
│  User can:                                          │
│  - Edit column name, type, length, nullable         │
│  - Add / delete columns                             │
│  - Rename / delete tables                           │
│  - View lineage per column                          │
│                                                     │
│  PUT /api/jobs/:jobId/schema on each save           │
│  → Server validates with Zod before storing         │
│  → status: UNDER_REVIEW or MODIFIED                 │
└─────────────────┬───────────────────────────────────┘
                  │
                  ▼ (user clicks Preview SQL)
┌─────────────────────────────────────────────────────┐
│  STEP 6: Deterministic SQL Generation               │
│                                                     │
│  POST /api/jobs/:jobId/generate-sql                 │
│                                                     │
│  sql-generator.ts:                                  │
│  - Reads approvedSchema from job                    │
│  - Builds CREATE TABLE statement from schema types  │
│  - No LLM involved                                  │
│  - Appends EUC lineage columns if toggle enabled    │
│                                                     │
│  Output stored in job.generatedSql                  │
│  Displayed in UI code block with copy button        │
└─────────────────┬───────────────────────────────────┘
                  │
                  ▼ (user clicks Approve & Create)
┌─────────────────────────────────────────────────────┐
│  STEP 7: Approval Validation                        │
│                                                     │
│  POST /api/jobs/:jobId/approve                      │
│                                                     │
│  Validates:                                         │
│  - schema exists                                    │
│  - table names: [A-Z0-9_], max 255 chars           │
│  - column names: [A-Z0-9_], no duplicates          │
│  - data types: allowlist only                       │
│  - precision/scale: precision > 0, scale <= prec   │
│  - at least one column per table                   │
│                                                     │
│  On success: status → APPROVED                      │
│  On failure: 400 with structured validation errors  │
└─────────────────┬───────────────────────────────────┘
                  │
                  ▼ (after confirmation dialog)
┌─────────────────────────────────────────────────────┐
│  STEP 8: Execution (Demo Mode)                      │
│                                                     │
│  POST /api/jobs/:jobId/execute                      │
│                                                     │
│  Guards:                                            │
│  - Rejects if status !== APPROVED                   │
│                                                     │
│  Demo Mode (DEMO_MODE=true):                        │
│  - 1.5s simulated delay                             │
│  - status → CREATED                                 │
│  - executionResult: { mode: DEMO, success: true,    │
│      database, schema, table, simulatedAt }         │
│                                                     │
│  Future Snowflake Mode:                             │
│  - Execute generatedSql via snowflake client        │
│  - Store queryId in executionResult                 │
└─────────────────┬───────────────────────────────────┘
                  │
                  ▼
┌─────────────────────────────────────────────────────┐
│  STEP 9: Result Screen                              │
│                                                     │
│  Shows:                                             │
│  - Progress timeline (all steps checkmarked)        │
│  - SUCCESS banner (DEMO / SIMULATED clearly labeled)│
│  - Final DDL                                        │
│  - Full audit trail with timestamps                 │
│  - Lineage panel per column                         │
└─────────────────────────────────────────────────────┘
```

---

## Job Status State Machine

```
UPLOADED
   │
   ▼ (ExcelJS parsing + region detection complete)
ANALYZING
   │
   ▼ (SchemaInferenceProvider returns WorkbookSchema)
SCHEMA_GENERATED
   │
   ▼ (user opens review page)
UNDER_REVIEW
   │
   ├─► (user edits schema)
   │         │
   │         ▼
   │       MODIFIED ─────────────────────────┐
   │                                         │
   └─────────────────────────────────────────┤
                                             │
                                             ▼ (POST /approve — all validations pass)
                                           APPROVED
                                             │
                                             ▼ (POST /execute)
                                           EXECUTING
                                             │
                                    ┌────────┴────────┐
                                    │                 │
                                    ▼                 ▼
                                 CREATED            FAILED
```

---

## Data Transformation at Each Step

### WorkbookAnalysis (output of Steps 1-2)

```typescript
{
  fileName: string
  sheets: Array<{
    name: string
    dimensions: { rows: number; cols: number }
    cells: Cell[][]          // [row][col] sparse array
    mergedCells: MergedCell[]
    candidateRegions: Region[]
  }>
}
```

### WorkbookSchema (output of Step 3, Zod-validated)

```typescript
{
  workbookName: string
  tables: Array<{
    tableName: string           // SCREAMING_SNAKE_CASE
    description: string
    sourceSheet: string
    sourceRange: string         // e.g. "A5:H250"
    tableType: "TRANSACTIONAL" | "LOOKUP" | "SUMMARY" | "CROSSTAB"
    confidence: number          // 0-1
    columns: Array<{
      name: string
      sourceColumn: string
      sourceRange: string
      dataType: SnowflakeDataType
      length?: number
      precision?: number
      scale?: number
      nullable: boolean
      confidence: number
      evidence: string[]
    }>
  }>
}
```

### Generated DDL (output of Step 6)

```sql
-- Finance Connect POC | AI EUC Schema Discovery
-- Source: RWA_EUC_Demo.xlsx
-- Generated: 2026-01-31T10:34:00Z
-- SQL generated deterministically from approved schema. LLM did not generate this SQL.

CREATE TABLE FINANCE_POC.EUC_SANDBOX.TRADE_EXPOSURE (
    TRADE_ID        VARCHAR(50)   NOT NULL,
    PRODUCT         VARCHAR(100),
    COUNTERPARTY    VARCHAR(100),
    TRADE_DATE      DATE,
    EXPOSURE        NUMBER(18,2),
    CURRENCY        VARCHAR(3),
    -- EUC Lineage Columns (optional toggle)
    SOURCE_FILE     VARCHAR(500),
    SOURCE_SHEET    VARCHAR(255),
    SOURCE_ROW      NUMBER,
    INGESTION_TIMESTAMP TIMESTAMP,
    EUC_VERSION     VARCHAR(100)
);
```

---

## Error Paths

| Error | Handling |
|---|---|
| Non-.xlsx file uploaded | 400 — rejected before parsing |
| ExcelJS parse failure | 500 — "Could not read workbook" |
| Empty workbook | 400 — "No usable data detected" |
| Claude API failure | Fall back to MockSchemaInferenceProvider, flag in response |
| Zod validation of LLM response fails | Retry once; then fallback to mock |
| Schema fails approval validation | 400 with field-level error list |
| Execute called before approval | 403 — "Schema must be approved before execution" |
| File over 10 MB | 413 — rejected at Route Handler boundary |
