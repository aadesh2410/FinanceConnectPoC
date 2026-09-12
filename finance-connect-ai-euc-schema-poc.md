# Finance Connect — AI EUC Schema Discovery POC

## 1. Purpose

Build a temporary, showcase-ready web application that demonstrates an AI-assisted workflow for uploading a Finance EUC Excel workbook, understanding its structure, extracting a proposed Snowflake data model, allowing a human/technology reviewer to modify and approve the schema, and finally generating/executing a Snowflake `CREATE TABLE` statement in a sandbox/demo environment.

The application is a POC inspired by an existing Finance Connect application whose production stack is:

- Angular frontend
- Java/Spring Boot backend
- Snowflake database

For this temporary POC, prioritize fast development and Vercel deployment. Use:

- Next.js + TypeScript
- React
- Tailwind CSS
- Server-side API routes / Route Handlers where backend functionality is needed
- ExcelJS or SheetJS for Excel parsing
- LLM provider through a server-side abstraction
- Mock/demo mode when an LLM or Snowflake credential is unavailable
- Optional Snowflake integration behind an explicit approval action

Do NOT expose LLM API keys or Snowflake credentials in browser/client-side code.

---

# 2. Business Problem

Finance users maintain EUCs (End User Computing files), often Excel workbooks containing calculations, inputs, reports, lookup tables, summaries, and data.

A typical workbook is not necessarily a clean database table.

Example:

```text
                         RWA Calculation

Reporting Date: 31-Jan-2026
Entity: ABC Bank
Currency: USD


Trade Information

Trade ID       Product       Counterparty
------------------------------------------
T001           IRS           Bank A
T002           Swap          Bank B


                    Exposure

Trade ID        Current      Potential      Total
-------------------------------------------------
T001            1000         200            1200
T002            2000         500            2500
```

A simple `first row = header` parser is insufficient.

The POC should demonstrate that AI can assist in understanding:

- Workbook/sheet structure
- Candidate data regions
- Header rows
- Multi-row headers
- Titles and metadata
- Data rows
- Numeric/date/string/boolean types
- Formula cells
- Summary vs transactional data
- Multiple logical tables within one sheet
- Potential relationships between tables
- Suggested Snowflake data types

The AI should propose a schema, but a human must remain in control.

---

# 3. Core Principle

## AI proposes. Application validates. Human approves. Database executes.

The LLM must NEVER directly execute SQL.

The flow must be:

```text
Excel
  ↓
Excel Parser
  ↓
Workbook Representation
  ↓
Schema Discovery / LLM
  ↓
Canonical Schema JSON
  ↓
Validation
  ↓
Human Review
  ↓
Human Modification
  ↓
SQL Generation by deterministic application code
  ↓
Explicit Approval
  ↓
Sandbox Snowflake execution OR simulated execution
```

Before approval, there must be no database write.

---

# 4. Primary E2E User Journey

The application must support this complete demo:

1. User opens application.
2. User uploads an `.xlsx` file.
3. Application displays workbook information.
4. Application displays all detected sheets.
5. Application analyzes each sheet.
6. Application identifies candidate logical tables/data regions.
7. AI generates a proposed schema.
8. UI displays:
   - table name
   - source sheet
   - source range
   - columns
   - Snowflake data type
   - nullable
   - confidence
   - evidence/reason
9. User can:
   - add column
   - edit column
   - delete column
   - rename table
   - change data type
   - change precision/scale
   - change nullable
   - reject a detected table
10. User can preview generated Snowflake DDL.
11. User explicitly approves.
12. Application either:
   - executes against configured Snowflake sandbox, OR
   - runs Demo Mode and simulates successful execution.
13. UI displays execution result.
14. UI displays generated table definition and audit information.

---

# 5. Important POC Constraint

This application must work without requiring real Snowflake credentials.

Implement two modes:

## Demo Mode

Default.

No real database writes.

When user clicks:

`Approve & Create`

simulate execution and show:

```text
SUCCESS

Table created successfully in Snowflake Sandbox.

Database: FINANCE_POC
Schema: EUC_SANDBOX
Table: TRADE_EXPOSURE
```

Clearly label it:

`DEMO / SIMULATED EXECUTION`

## Snowflake Mode

Optional.

If environment variables are configured, execute the generated DDL against a real Snowflake sandbox.

Never expose credentials to the browser.

---

# 6. Recommended Technology

## Frontend

- Next.js
- TypeScript
- React
- Tailwind CSS
- shadcn/ui or another clean component library
- Lucide icons

## Excel parsing

Prefer ExcelJS or SheetJS.

Need to extract:

- sheet names
- used ranges
- cell values
- formulas
- cell types
- merged cells
- hidden rows/columns where available
- basic formatting where available
- candidate non-empty regions

## Backend

Use Next.js Route Handlers/server actions.

Suggested APIs:

```text
POST /api/analyze
GET  /api/jobs/:jobId
PUT  /api/jobs/:jobId/schema
POST /api/jobs/:jobId/generate-sql
POST /api/jobs/:jobId/approve
POST /api/jobs/:jobId/execute
```

## LLM

Create an abstraction:

```text
SchemaInferenceProvider
```

with:

```text
MockSchemaInferenceProvider
LLMSchemaInferenceProvider
```

This means the POC works immediately in demo mode and can later use a real LLM.

---

# 7. Application Screens

## Screen 1 — Landing / Upload

Title:

`Finance Connect — AI EUC Schema Discovery`

Subtitle:

`Transform complex Excel EUCs into reviewable Snowflake data models.`

Display a high-level workflow:

```text
UPLOAD → ANALYZE → REVIEW → APPROVE → CREATE
```

Upload card:

```text
┌───────────────────────────────────────┐
│                                       │
│       Drop Excel EUC here             │
│                                       │
│       or [Choose File]                │
│                                       │
│       .xlsx supported                 │
│                                       │
└───────────────────────────────────────┘
```

After upload show:

```text
File: RWA_EUC_Feb_2026.xlsx
Sheets: 6
Size: 1.8 MB

[Analyze Workbook]
```

---

# 8. Screen 2 — Workbook Analysis

Show:

```text
Workbook Analysis

File
RWA_EUC_Feb_2026.xlsx

Sheets
6

Candidate Tables
4

Status
Analysis Complete
```

Display sheets as cards:

```text
Trade Exposure
250 rows × 8 columns
2 candidate regions
Confidence: 96%

Counterparty
120 rows × 6 columns
1 candidate region
Confidence: 94%

RWA Summary
35 rows × 10 columns
1 candidate region
Confidence: 89%

Parameters
22 rows × 4 columns
Potential lookup/parameter sheet
```

Use badges:

- High Confidence
- Medium Confidence
- Low Confidence
- Lookup
- Summary
- Transactional

---

# 9. Screen 3 — AI Schema Review

This is the most important screen.

Use a two-pane layout.

Left:

`Excel Preview`

Right:

`Proposed Snowflake Schema`

Example:

```text
┌──────────────────────────┬────────────────────────────────────┐
│ Excel Preview            │ Proposed Schema                    │
│                          │                                    │
│ Trade ID | Product | ... │ TRADE_EXPOSURE                     │
│ T001     | IRS     | ... │ Confidence: 96%                   │
│ T002     | SWAP    | ... │                                    │
│                          │ ┌────────────────────────────────┐ │
│ Source:                  │ │ TRADE_ID                       │ │
│ Trade Exposure!A5:H250   │ │ VARCHAR(50)   NOT NULL   99% │ │
│                          │ ├────────────────────────────────┤ │
│                          │ │ PRODUCT                        │ │
│                          │ │ VARCHAR(100) NULL        97% │ │
│                          │ ├────────────────────────────────┤ │
│                          │ │ TRADE_DATE                     │ │
│                          │ │ DATE NULL                95% │ │
│                          │ ├────────────────────────────────┤ │
│                          │ │ EXPOSURE                       │ │
│                          │ │ NUMBER(18,2) NULL        92% │ │
│                          │ └────────────────────────────────┘ │
│                          │                                    │
│                          │ [+ Add Column]                      │
└──────────────────────────┴────────────────────────────────────┘
```

---

# 10. Schema Editing Requirements

Every proposed column must be editable.

Fields:

```text
Column Name
Data Type
Length
Precision
Scale
Nullable
Description
Source Sheet
Source Range
Confidence
```

Supported types:

```text
VARCHAR
NUMBER
INTEGER
FLOAT
BOOLEAN
DATE
TIMESTAMP
```

Actions:

```text
Edit
Delete
Add
```

Table actions:

```text
Rename Table
Delete Table
Add Table
```

When deleting an AI-generated item, mark it as user-rejected rather than silently losing the original proposal in the audit state.

---

# 11. Confidence and Evidence

Do NOT expose chain-of-thought.

Instead, expose concise structured evidence.

Example:

```text
EXPOSURE

Type:
NUMBER(18,2)

Confidence:
92%

Evidence:
• 100% of populated values are numeric
• Column header contains "Exposure"
• Maximum observed decimal scale is 2
```

Example:

```text
TRADE_DATE

Type:
DATE

Confidence:
95%

Evidence:
• Values consistently parse as dates
• Header contains "Date"
• 248/250 populated values match date patterns
```

Low-confidence fields should be highlighted.

Example:

```text
⚠ Review Recommended

AMOUNT

Possible type:
NUMBER(18,2)

Confidence:
72%

Reason:
Several rows contain "-" instead of numeric values.
```

---

# 12. Canonical Schema JSON

The LLM must return structured JSON matching this conceptual model:

```json
{
  "workbookName": "RWA_EUC_Feb_2026.xlsx",
  "tables": [
    {
      "tableName": "TRADE_EXPOSURE",
      "description": "Trade-level exposure data",
      "sourceSheet": "Trade Exposure",
      "sourceRange": "A5:H250",
      "tableType": "TRANSACTIONAL",
      "confidence": 0.96,
      "columns": [
        {
          "name": "TRADE_ID",
          "sourceColumn": "A",
          "sourceRange": "A6:A250",
          "dataType": "VARCHAR",
          "length": 50,
          "nullable": false,
          "confidence": 0.99,
          "evidence": [
            "Header indicates trade identifier",
            "Values contain alphanumeric identifiers"
          ]
        },
        {
          "name": "TRADE_DATE",
          "sourceColumn": "D",
          "sourceRange": "D6:D250",
          "dataType": "DATE",
          "nullable": true,
          "confidence": 0.95,
          "evidence": [
            "Values consistently parse as dates",
            "Header contains Date"
          ]
        },
        {
          "name": "EXPOSURE",
          "sourceColumn": "F",
          "sourceRange": "F6:F250",
          "dataType": "NUMBER",
          "precision": 18,
          "scale": 2,
          "nullable": true,
          "confidence": 0.92,
          "evidence": [
            "Numeric values",
            "Header contains Exposure"
          ]
        }
      ]
    }
  ]
}
```

Use runtime validation with Zod.

Never trust arbitrary LLM output.

---

# 13. Excel Understanding

Do NOT assume:

```text
row 1 = header
```

The application should attempt to identify:

- title regions
- metadata
- headers
- multi-level headers
- data regions
- totals/subtotals
- formulas
- blank separator rows
- merged cells
- repeated headers
- lookup tables
- summary tables
- transactional tables

For the initial POC, heuristic detection is acceptable.

The architecture must allow replacing the heuristics with more advanced AI later.

---

# 14. Example Complex Excel Scenario

Support a workbook containing:

```text
Sheet: Trade Exposure

A1:H1
"RWA Calculation"

A2:B2
"Reporting Date" | "31-Jan-2026"

A5:H5
Trade ID | Product | Counterparty | Trade Date | Currency | Exposure | RWA | Status

A6:H250
actual data
```

The system should identify:

```text
A1:H1
TITLE

A2:B2
METADATA

A5:H250
TABLE
```

The resulting table should NOT contain:

```text
RWA Calculation
Reporting Date
```

as ordinary columns.

---

# 15. Multi-row Header Example

Support:

```text
             Exposure              RWA
Trade ID     Current   Potential   Total
-----------------------------------------
T001         1000      200         1200
T002         2000      500         2500
```

The AI may propose:

```text
TRADE_ID
CURRENT_EXPOSURE
POTENTIAL_EXPOSURE
TOTAL_EXPOSURE
```

Show the transformation to the user.

---

# 16. Pivot-like / Cross-tab Example

For:

```text
             Jan      Feb      Mar
Revenue      100      120      140
Expense       50       60       70
```

The system should recognize that the layout may be better represented as:

```text
MONTH
METRIC
VALUE
```

rather than blindly creating:

```text
JAN
FEB
MAR
```

This is an advanced capability.

For the POC, it is acceptable for the Mock AI provider to demonstrate this behavior using predefined examples.

---

# 17. Snowflake Model

The POC should initially create one Snowflake table per logical table detected.

Example:

```text
Database:
FINANCE_POC

Schema:
EUC_SANDBOX

Table:
TRADE_EXPOSURE
```

DDL:

```sql
CREATE TABLE FINANCE_POC.EUC_SANDBOX.TRADE_EXPOSURE (
    TRADE_ID VARCHAR(50) NOT NULL,
    PRODUCT VARCHAR(100),
    COUNTERPARTY VARCHAR(100),
    TRADE_DATE DATE,
    EXPOSURE NUMBER(18,2),
    CURRENCY VARCHAR(3)
);
```

Do not use the LLM to generate this SQL.

Generate SQL deterministically from the approved schema.

---

# 18. Recommended Audit Columns

Optionally provide a toggle:

`Add EUC Lineage Columns`

If enabled, append:

```text
SOURCE_FILE
SOURCE_SHEET
SOURCE_ROW
INGESTION_TIMESTAMP
EUC_VERSION
```

Example:

```sql
SOURCE_FILE VARCHAR(500),
SOURCE_SHEET VARCHAR(255),
SOURCE_ROW NUMBER,
INGESTION_TIMESTAMP TIMESTAMP,
EUC_VERSION VARCHAR(100)
```

Explain in the UI that these fields improve lineage and auditability.

---

# 19. Approval Workflow

Before approval:

```text
Status: DRAFT / UNDER REVIEW
```

Show:

```text
Database writes are disabled.
```

User can:

```text
[Save Changes]
[Preview SQL]
```

Only show:

```text
[Approve & Create]
```

when the schema passes validation.

On clicking approval, show a confirmation dialog:

```text
You are about to create the following table in the Finance Connect sandbox:

FINANCE_POC.EUC_SANDBOX.TRADE_EXPOSURE

No production systems will be modified.

[Cancel]
[Approve & Execute]
```

---

# 20. SQL Preview

Show generated SQL in a code block with copy button.

Example:

```sql
CREATE TABLE FINANCE_POC.EUC_SANDBOX.TRADE_EXPOSURE (
    TRADE_ID VARCHAR(50) NOT NULL,
    PRODUCT VARCHAR(100),
    COUNTERPARTY VARCHAR(100),
    TRADE_DATE DATE,
    EXPOSURE NUMBER(18,2),
    CURRENCY VARCHAR(3)
);
```

Also show:

```text
SQL generated from approved schema
LLM is not permitted to execute SQL
```

---

# 21. Execution Screen

Show a progress timeline:

```text
✓ Schema generated
✓ Human review completed
✓ Schema approved
✓ SQL generated
● Creating Snowflake table
○ Completed
```

Demo Mode result:

```text
SUCCESS

Table creation simulated successfully.

FINANCE_POC.EUC_SANDBOX.TRADE_EXPOSURE

Execution Mode:
DEMO / SIMULATED
```

Real Snowflake mode:

```text
SUCCESS

Table created successfully.

Query ID:
<query id>
```

Do not expose credentials.

---

# 22. Job Model

Create an in-memory or lightweight persistence model for the POC.

A job should contain:

```text
jobId
fileName
createdAt
status
workbookSummary
proposedSchema
approvedSchema
generatedSql
executionMode
executionResult
auditEvents
```

Possible statuses:

```text
UPLOADED
ANALYZING
SCHEMA_GENERATED
UNDER_REVIEW
MODIFIED
APPROVED
EXECUTING
CREATED
FAILED
```

For Vercel demo purposes, do not assume process memory survives across requests. Prefer a lightweight demo persistence mechanism if needed, or encode/reconstruct state carefully.

If no database is configured, keep the demo flow functional with client state plus server validation, but make it clear that demo persistence is temporary.

---

# 23. API Contract

## POST /api/analyze

Input:

Multipart form upload.

Response:

```json
{
  "jobId": "demo-123",
  "status": "SCHEMA_GENERATED",
  "workbookSummary": {},
  "schema": {}
}
```

---

## GET /api/jobs/:jobId

Returns current job.

---

## PUT /api/jobs/:jobId/schema

Input:

Approved/edited schema JSON.

Server must validate it.

---

## POST /api/jobs/:jobId/generate-sql

Generate deterministic SQL from the current schema.

---

## POST /api/jobs/:jobId/approve

Validate:

- schema exists
- valid table names
- valid column names
- valid Snowflake data types
- no duplicate columns
- required metadata present

Then set:

```text
APPROVED
```

---

## POST /api/jobs/:jobId/execute

Must reject requests unless:

```text
job.status == APPROVED
```

Then:

```text
if DEMO_MODE:
    simulate success
else:
    execute Snowflake DDL
```

---

# 24. Validation Rules

Validate table names:

```text
Only letters, numbers and underscore
Maximum sensible Snowflake identifier length
```

Validate columns:

```text
No duplicates
No empty names
Allowed characters
```

Validate types:

```text
VARCHAR
NUMBER
INTEGER
FLOAT
BOOLEAN
DATE
TIMESTAMP
```

Validate:

```text
precision > 0
scale >= 0
scale <= precision
```

Never allow arbitrary SQL from user input.

---

# 25. LLM Prompt Design

Create a server-side prompt.

System intent:

```text
You are a financial data modeling assistant.

Your task is to analyze a structured representation of an Excel EUC workbook and propose a Snowflake-compatible logical schema.

Do not generate SQL.

Do not invent data.

Identify logical tables and columns based on:
- cell values
- headers
- formulas
- formatting metadata
- merged cells
- source ranges
- semantic meaning

Distinguish metadata, titles, summaries, lookup areas and actual data tables.

For each proposed column:
- infer Snowflake-compatible data type
- determine nullable
- provide confidence from 0 to 1
- provide concise evidence based on observed workbook data

Return ONLY the defined JSON schema.
```

The prompt should be versioned in code.

Example:

```text
SCHEMA_PROMPT_VERSION = "v1"
```

---

# 26. LLM Provider Abstraction

Create:

```typescript
interface SchemaInferenceProvider {
  inferSchema(input: WorkbookAnalysis): Promise<WorkbookSchema>;
}
```

Implement:

```text
MockSchemaInferenceProvider
LLMSchemaInferenceProvider
```

Environment:

```text
AI_MODE=mock
```

or:

```text
AI_MODE=llm
```

Mock mode must return realistic results.

This ensures the demo works without external credentials.

---

# 27. Mock Demo Workbook

Include a downloadable or built-in demo workbook.

Create a realistic finance-style example named:

```text
RWA_EUC_Demo.xlsx
```

It should contain at least 4 sheets:

## 1. Trade Exposure

A transactional table with:

```text
TRADE_ID
PRODUCT
COUNTERPARTY
TRADE_DATE
CURRENCY
CURRENT_EXPOSURE
POTENTIAL_EXPOSURE
TOTAL_EXPOSURE
```

## 2. Counterparty

```text
COUNTERPARTY_ID
COUNTERPARTY_NAME
COUNTRY
RATING
SECTOR
```

## 3. RWA Summary

Use a summary/cross-tab layout.

## 4. Parameters

Include lookup/reference values.

The demo should demonstrate that different sheet types are recognized differently.

---

# 28. Finance-oriented terminology

Use terminology that sounds appropriate for a financial technology POC:

- EUC
- Data lineage
- Schema discovery
- Human-in-the-loop
- Data classification
- Sandbox
- Approval workflow
- Source range
- Data model
- Snowflake
- RWA
- Counterparty
- Exposure
- Trade
- Reference/lookup data
- Audit trail

Do not claim the POC is production-ready or compliant with Morgan Stanley production controls.

Use:

`Finance Connect POC`

rather than implying this is an official production Morgan Stanley application.

---

# 29. Audit Trail UI

Show:

```text
Audit Trail

10:32:11  File uploaded
10:32:13  Workbook analyzed
10:32:19  AI schema generated
10:33:02  User modified EXPOSURE
10:33:15  User deleted TEMP_COLUMN
10:33:40  SQL generated
10:34:01  Schema approved
10:34:04  Sandbox execution completed
```

For each event record:

```text
timestamp
event
actor
details
```

For POC use:

```text
actor = Demo User
```

---

# 30. Data Lineage UI

For each column allow a "Lineage" action.

Example:

```text
TRADE_EXPOSURE.EXPOSURE

Snowflake:
FINANCE_POC.EUC_SANDBOX.TRADE_EXPOSURE.EXPOSURE

Source:
RWA_EUC_Demo.xlsx

Sheet:
Trade Exposure

Range:
F6:F250

Inferred Type:
NUMBER(18,2)

Confidence:
92%
```

This is a strong feature for the demo.

---

# 31. Error Handling

The application must handle:

### Invalid file

```text
Only .xlsx files are supported.
```

### Empty workbook

```text
No usable data detected.
```

### LLM failure

Fallback:

```text
AI analysis failed.

[Retry]
[Use heuristic analysis]
```

### Low confidence

Do not block schema generation.

Instead show:

```text
Review Recommended
```

### Invalid schema

Prevent approval and show validation errors.

### Snowflake unavailable

Show:

```text
Snowflake is unavailable.

Switching to Demo Mode.
```

Never silently claim a real table was created.

---

# 32. Security Requirements

Never:

- put API keys in frontend code
- put Snowflake credentials in frontend code
- execute arbitrary SQL from LLM output
- execute SQL before explicit approval
- trust raw LLM output
- allow arbitrary database/schema/table identifiers without validation

Use environment variables:

```text
LLM_API_KEY
SNOWFLAKE_ACCOUNT
SNOWFLAKE_USER
SNOWFLAKE_PASSWORD
SNOWFLAKE_DATABASE
SNOWFLAKE_SCHEMA
SNOWFLAKE_WAREHOUSE
SNOWFLAKE_ROLE
```

Only server-side code may access them.

For the public Vercel demo, default to:

```text
DEMO_MODE=true
AI_MODE=mock
```

---

# 33. Vercel Deployment

The application must be deployable with:

```text
npm install
npm run dev
```

and:

```text
npm run build
npm run start
```

It should deploy to Vercel without requiring a separate Java server.

Use server-side Route Handlers for backend functionality.

Do not require a long-running server.

Be mindful of serverless execution limits and file size limits. For the POC, restrict uploads to a reasonable size such as 10 MB.

---

# 34. UI Design

The UI should feel like an enterprise financial technology application.

Style:

- clean
- professional
- minimal
- data-dense but readable
- white/light neutral background
- subtle borders
- restrained use of color
- strong status badges
- good spacing
- responsive

Use a top navigation/header:

```text
Finance Connect
AI EUC Schema Discovery
```

Top-right:

```text
DEMO MODE
```

Use status badges:

```text
AI ANALYSIS
UNDER REVIEW
APPROVED
SANDBOX
SUCCESS
WARNING
```

Avoid making it look like a generic AI chatbot.

This is a data modeling workflow.

---

# 35. Dashboard Summary

After analysis show:

```text
Workbook Summary

6 Sheets
4 Candidate Tables
38 Proposed Columns
5 Low Confidence Fields
12 Formula Regions
8 Lookup/Reference Areas
```

Then:

```text
Schema Readiness: 91%
```

This is a presentation-friendly metric.

---

# 36. Explainable AI Panel

Include an optional side panel:

```text
How did AI determine this?

Detected:
✓ Header row
✓ Numeric values
✓ Date pattern
✓ Repeated transaction rows
✓ Consistent column semantics

Potential issues:
⚠ 2 rows contain non-numeric exposure values
⚠ 1 column has mixed date formats
```

Again, this is evidence, not hidden model reasoning.

---

# 37. Future Architecture

Design the code so that future versions can add:

```text
Excel
 ↓
Document/Spreadsheet Understanding
 ↓
AI Schema Discovery
 ↓
Business Entity Identification
 ↓
Relationship Detection
 ↓
Enterprise Data Model
 ↓
Data Classification
 ↓
Lineage
 ↓
Approval
 ↓
Snowflake
```

Future features:

- schema versioning
- schema evolution
- data quality rules
- primary key suggestions
- foreign key suggestions
- PII/sensitive data detection
- business glossary mapping
- column descriptions
- automated data lineage
- ingestion pipeline generation
- dbt model generation
- data contracts
- approval by multiple roles
- integration into real Finance Connect

---

# 38. Acceptance Criteria

The POC is successful if a user can:

### Upload

- Upload an Excel workbook.
- See workbook and sheet information.
- Support multiple sheets.

### Analyze

- Detect candidate logical tables.
- Distinguish obvious metadata/title sections from table data.
- Infer columns.
- Infer basic Snowflake types.
- Provide confidence and evidence.

### Review

- See source Excel data.
- See proposed Snowflake schema.
- Add columns.
- Edit columns.
- Delete columns.
- Change types.
- Change nullable.
- Rename tables.
- See lineage.

### Generate

- Generate deterministic Snowflake DDL.
- Preview SQL before execution.

### Approve

- Explicitly approve schema.
- Prevent execution before approval.

### Execute

- Demo Mode must simulate execution.
- Optional Snowflake Mode must execute only approved DDL.

### Audit

- Show the full workflow history.

---

# 39. Suggested Demo Script

Use this exact story when showcasing the POC.

## Step 1

Upload:

```text
RWA_EUC_Demo.xlsx
```

Say:

> "This represents a typical Finance EUC containing transactional data, reference data and summary calculations."

## Step 2

Show workbook analysis.

Say:

> "The application doesn't assume that every worksheet is a table. It first analyzes the workbook structure."

## Step 3

Show detected regions.

Say:

> "The AI has identified three logical data structures and classified the parameter sheet as reference data."

## Step 4

Open Trade Exposure.

Say:

> "The AI inferred these columns and mapped them to Snowflake-compatible types."

## Step 5

Click `EXPOSURE`.

Show:

```text
NUMBER(18,2)
Confidence: 92%
```

Say:

> "The confidence and evidence allow the technology team to validate AI decisions rather than blindly trusting the model."

## Step 6

Modify:

```text
NUMBER(18,2)
```

to:

```text
NUMBER(20,4)
```

Add:

```text
REPORTING_DATE DATE
```

Delete an incorrectly inferred field.

## Step 7

Show SQL Preview.

Say:

> "SQL is generated deterministically from the approved schema. The LLM does not get permission to execute SQL."

## Step 8

Click:

```text
Approve & Create
```

Show confirmation.

## Step 9

Execute in Demo Mode.

Show:

```text
SUCCESS
FINANCE_POC.EUC_SANDBOX.TRADE_EXPOSURE
```

## Step 10

Open lineage.

Show:

```text
Snowflake Column
↓
Excel Sheet
↓
Excel Range
↓
AI Inference
```

Finish with:

> "The POC demonstrates how we can move from an unstructured Finance EUC to a governed, human-reviewed Snowflake data model while keeping database execution explicitly controlled."

---

# 40. Project Structure

Use a clean structure similar to:

```text
finance-connect-ai-poc/
│
├── app/
│   ├── page.tsx
│   ├── upload/
│   │   └── page.tsx
│   ├── jobs/
│   │   └── [jobId]/
│   │       ├── page.tsx
│   │       ├── review/
│   │       │   └── page.tsx
│   │       └── result/
│   │           └── page.tsx
│   │
│   └── api/
│       ├── analyze/
│       └── jobs/
│
├── components/
│   ├── upload/
│   ├── workbook/
│   ├── schema/
│   ├── sql/
│   ├── lineage/
│   ├── audit/
│   └── common/
│
├── lib/
│   ├── excel/
│   │   ├── parser.ts
│   │   ├── region-detector.ts
│   │   └── workbook-analyzer.ts
│   │
│   ├── ai/
│   │   ├── provider.ts
│   │   ├── mock-provider.ts
│   │   ├── llm-provider.ts
│   │   └── prompts.ts
│   │
│   ├── schema/
│   │   ├── types.ts
│   │   ├── validation.ts
│   │   └── sql-generator.ts
│   │
│   ├── snowflake/
│   │   └── client.ts
│   │
│   └── audit/
│
├── public/
│   └── demo/
│       └── RWA_EUC_Demo.xlsx
│
├── types/
│
├── README.md
├── package.json
└── .env.example
```

---

# 41. Implementation Priorities

Build in this order:

## Priority 1

Working upload.

## Priority 2

Excel parsing and workbook preview.

## Priority 3

Mock AI schema extraction.

## Priority 4

Schema review/edit UI.

## Priority 5

Deterministic SQL generation.

## Priority 6

Approval workflow.

## Priority 7

Demo execution.

## Priority 8

Real LLM integration.

## Priority 9

Optional Snowflake integration.

## Priority 10

Lineage and audit enhancements.

Do not block the POC on real LLM/Snowflake credentials.

---

# 42. Coding Rules for the AI Developer

1. Produce production-quality TypeScript.
2. Use strict TypeScript.
3. Avoid `any` unless absolutely unavoidable.
4. Separate UI, business logic and integrations.
5. Keep LLM integration behind an interface.
6. Keep Snowflake integration behind an interface.
7. Validate all LLM output.
8. Never execute raw LLM-generated SQL.
9. Generate SQL only from validated schema objects.
10. Keep Demo Mode fully functional.
11. Provide loading/error/empty states.
12. Make the application responsive.
13. Add comments only where they explain non-obvious decisions.
14. Do not over-engineer authentication for this temporary POC.
15. Do not add a database dependency unless necessary.
16. Make the POC deployable to Vercel.
17. Include `.env.example`.
18. Include README instructions.
19. Include a realistic demo workbook.
20. Ensure `npm run build` succeeds before considering the implementation complete.

---

# 43. Final Deliverable

The final application must demonstrate:

```text
UPLOAD
   ↓
UNDERSTAND EXCEL
   ↓
AI SCHEMA DISCOVERY
   ↓
SHOW PROPOSED MODEL
   ↓
HUMAN MODIFICATION
   ↓
VALIDATE
   ↓
GENERATE SNOWFLAKE SQL
   ↓
HUMAN APPROVAL
   ↓
SANDBOX EXECUTION
   ↓
AUDIT + LINEAGE
```

The application should feel like a real extension of a financial technology platform, not a generic AI demo.

The key message of the POC:

> **Convert complex Finance EUCs into governed Snowflake-ready data models using AI-assisted schema discovery with human approval and controlled execution.**
