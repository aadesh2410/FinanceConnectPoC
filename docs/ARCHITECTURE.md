# Finance Connect — AI EUC Schema Discovery POC
## Architecture Overview

---

## Core Principle

> **AI proposes. Application validates. Human approves. Application generates SQL. No database executes without explicit approval.**

The LLM never touches SQL. It only returns structured JSON. Deterministic application code converts the approved schema into DDL.

---

## Tech Stack

| Layer | Technology | Rationale |
|---|---|---|
| Framework | Next.js 14 (App Router) | Server components + Route Handlers in one repo; Vercel-native |
| Language | TypeScript (strict) | Required by spec |
| Styling | Tailwind CSS + shadcn/ui | Enterprise-clean look; accessible components |
| Icons | Lucide React | Consistent with shadcn/ui |
| Excel Parsing | ExcelJS | Richer metadata access: merged cells, formulas, cell types, formatting |
| LLM | Anthropic Claude (claude-sonnet-4-6) | User's existing subscription; best structured JSON output |
| Anthropic SDK | `@anthropic-ai/sdk` with prompt caching | System prompt is large and reused per job — cache it |
| State / Jobs | Upstash Redis | Serverless-safe; survives across Vercel function invocations |
| Validation | Zod | Runtime validation of all LLM output and API inputs |
| Deployment | Vercel | Serverless; no long-running process required |

---

## System Components

```
┌─────────────────────────────────────────────────────────────────┐
│                        Browser (Next.js Client)                  │
│                                                                   │
│  UploadPage → WorkbookAnalysisPage → SchemaReviewPage → ResultPage│
│                                                                   │
│  State: React state + server polling (no client-side secrets)    │
└───────────────────────────────┬─────────────────────────────────┘
                                │ HTTP (fetch)
                                ▼
┌─────────────────────────────────────────────────────────────────┐
│                    Next.js Route Handlers (Server)               │
│                                                                   │
│  POST /api/analyze          ← receives xlsx, triggers pipeline  │
│  GET  /api/jobs/[jobId]     ← returns job state                 │
│  PUT  /api/jobs/[jobId]/schema ← saves human edits              │
│  POST /api/jobs/[jobId]/generate-sql ← deterministic DDL        │
│  POST /api/jobs/[jobId]/approve ← validates + marks approved    │
│  POST /api/jobs/[jobId]/execute ← demo simulation only          │
│                                                                   │
└──────┬──────────────────────────────┬───────────────────────────┘
       │                              │
       ▼                              ▼
┌──────────────────┐      ┌──────────────────────────────────────┐
│   ExcelJS Parser │      │         SchemaInferenceProvider       │
│                  │      │                                        │
│  - sheet names   │      │  interface SchemaInferenceProvider    │
│  - used ranges   │      │    inferSchema(WorkbookAnalysis)      │
│  - cell values   │      │      : Promise<WorkbookSchema>        │
│  - formulas      │      │                                        │
│  - merged cells  │      │  MockSchemaInferenceProvider          │
│  - cell types    │      │    → returns hardcoded realistic JSON │
│  - regions       │      │                                        │
│                  │      │  ClaudeSchemaInferenceProvider        │
└──────────────────┘      │    → calls Anthropic API             │
                          │    → validates response with Zod      │
                          │    → prompt caching on system prompt  │
                          └──────────────────────────────────────┘
                                        │
                                        ▼
                          ┌──────────────────────────────────────┐
                          │           Upstash Redis               │
                          │                                        │
                          │  job:{jobId} → Job JSON              │
                          │  TTL: 24 hours (demo use)            │
                          └──────────────────────────────────────┘
```

---

## Key Design Decisions

### 1. LLM returns JSON only — never SQL

The Claude prompt explicitly instructs: return only the canonical schema JSON. Zod validates the response before it touches any application state. If validation fails, the system falls back to the mock provider result or surfaces an error.

### 2. Prompt Caching

The schema inference system prompt is large (~800 tokens). Every job reuses the same system prompt. Anthropic's prompt caching is applied to the system prompt block, reducing latency and cost by ~90% after the first cache fill.

```typescript
// Cached block (system prompt — stable across all jobs)
{ type: "text", text: SCHEMA_SYSTEM_PROMPT, cache_control: { type: "ephemeral" } }

// Uncached block (per-job workbook data — changes every request)
{ type: "text", text: JSON.stringify(workbookAnalysis) }
```

### 3. State in Upstash Redis (not in-memory)

Vercel serverless functions are stateless and may run on different instances per request. In-memory job state would be lost. Upstash Redis provides a serverless-friendly key-value store. Job records are stored as JSON strings with a 24-hour TTL.

### 4. No Snowflake dependency

The POC's primary deliverable is a clean, human-reviewed Snowflake DDL string. No Snowflake connection is required. The `execute` endpoint simulates success in Demo Mode. The Snowflake client module exists as a stub for future integration.

### 5. SQL generated deterministically from schema objects

The `sql-generator.ts` module converts a `WorkbookSchema` into DDL using simple string templating — no LLM involved at this step. This makes the SQL output predictable, auditable, and safe.

### 6. AI Mode toggle

```
AI_MODE=mock   → MockSchemaInferenceProvider (default, no API key needed)
AI_MODE=claude → ClaudeSchemaInferenceProvider (requires LLM_API_KEY)
```

The POC works end-to-end with `AI_MODE=mock`. The LLM integration is an enhancement.

---

## Security Model

| Concern | Mitigation |
|---|---|
| API keys in client | Never. All LLM calls in Route Handlers only. |
| Snowflake credentials in client | Never. Stub client is server-side only. |
| Arbitrary SQL from LLM | LLM never generates SQL. SQL is generated from validated schema objects. |
| Unvalidated LLM JSON | All LLM responses parsed through Zod schema before use. |
| SQL injection via column names | Identifier validation: letters, numbers, underscore only. Max length enforced. |
| Execution before approval | `/execute` endpoint rejects unless `job.status === 'APPROVED'`. |
| Arbitrary DB/table names | Allowlist validation on all identifiers at approval time. |

---

## Environment Variables

```bash
# Required for Claude mode
LLM_API_KEY=sk-ant-...

# AI provider selection
AI_MODE=mock          # or: claude

# Demo mode (default true)
DEMO_MODE=true

# Upstash Redis
UPSTASH_REDIS_REST_URL=https://...
UPSTASH_REDIS_REST_TOKEN=...

# Future Snowflake (stub — not needed for POC)
SNOWFLAKE_ACCOUNT=
SNOWFLAKE_USER=
SNOWFLAKE_PASSWORD=
SNOWFLAKE_DATABASE=FINANCE_POC
SNOWFLAKE_SCHEMA=EUC_SANDBOX
SNOWFLAKE_WAREHOUSE=
SNOWFLAKE_ROLE=
```

---

## Vercel Deployment Notes

- Upload limit: 10 MB enforced server-side (Vercel body limit)
- ExcelJS runs in Node.js Route Handler — not in Edge runtime
- Route Handlers must use `export const runtime = 'nodejs'`
- Redis connection uses HTTP REST API (Upstash) — no persistent TCP connection needed
- `npm run build` must pass before considering implementation complete
