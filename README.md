# FinanceConnectPoC

A Next.js proof-of-concept that uploads Excel EUC (End User Computing) workbooks, uses Claude AI to infer Snowflake table schemas, and provides a review/edit UI before handoff to a data engineering pipeline.

---

## Features

- Upload `.xlsx` EUC workbooks (up to 10 MB)
- Claude AI (Opus 4.7 with adaptive thinking) infers Snowflake schemas via a two-stage prompt
- Finance-domain-aware parser: numFmt signals, named ranges, multi-level headers, cell comments
- Schema review UI: inline edit column names, data types, nullable flags, descriptions; soft-delete columns; table-level edits
- Full audit trail per job
- In-memory job store (survives Next.js hot reloads via `global` attachment)
- Demo mode — no real Snowflake execution

---

## Prerequisites

- Node.js 18+
- An Anthropic API key (for real schema inference — free tier works for the PoC)

---

## Setup

```bash
# 1. Clone
git clone https://github.com/aadesh2410/FinanceConnectPoC.git
cd FinanceConnectPoC

# 2. Install dependencies
npm install

# 3. Configure environment
cp .env.example .env.local
```

Open `.env.local` and fill in your Anthropic API key:

```env
AI_MODE=claude
DEMO_MODE=true
ANTHROPIC_API_KEY=sk-ant-api03-<your-key-here>
```

> Get your API key at https://console.anthropic.com/settings/keys

```bash
# 4. Start the dev server
npm run dev
```

Open http://localhost:3000 in your browser.

---

## Test Input Files

Two sample EUC workbooks are included in `public/` for immediate testing:

| File | Complexity | Description |
|------|-----------|-------------|
| `Level2_FX_Exposure_EUC.xlsx` | Level 2 | FX trading desk EUC — 4 sheets: FX Trade Register (80 rows, TRANSACTIONAL), Counterparty Master (LOOKUP), MTM Summary (SUMMARY), Risk Parameters (LOOKUP) |
| `Level3_Credit_Risk_EUC.xlsx` | Level 3 | Credit risk monitoring EUC — 5 sheets: Credit Exposure Register (100 rows, multi-level headers, null sentinels, named ranges), Rating Migration Matrix (CROSSTAB), Sector Concentration (SUMMARY with cross-sheet SUMIF), Counterparty Master (LOOKUP), Risk Model Parameters (LOOKUP with cell comments) |

To use them, download from the running app at `http://localhost:3000/Level2_FX_Exposure_EUC.xlsx` (or drag from your `public/` folder) and upload via the home page.

---

## Project Structure

```
app/
  page.tsx                      # Upload UI
  api/analyze/route.ts          # POST /api/analyze — parses workbook + calls Claude
  api/jobs/[jobId]/route.ts     # GET/PATCH job state
  jobs/[jobId]/review/page.tsx  # Schema review + inline edit UI

lib/
  excel/
    parser.ts                   # ExcelJS workbook parser (numFmt, comments, named ranges)
    region-detector.ts          # Heuristic region + multi-level header detection
    workbook-analyzer.ts        # Orchestrates parse → analyze → summary
  ai/
    provider.ts                 # WorkbookAnalysis interface
    claude-provider.ts          # Two-stage Claude prompt (finance system prompt + schema JSON)
    mock-provider.ts            # Offline mock for local dev without API key
    index.ts                    # Selects provider based on AI_MODE
  jobs/
    job-store.ts                # In-memory job store (global-attached for hot-reload safety)
  schema/
    types.ts                    # TypeScript types
    zod-schemas.ts              # Zod validation schemas

scripts/
  generate-level2-euc.mjs      # Generator for the Level 2 FX test file
  generate-level3-euc.mjs      # Generator for the Level 3 Credit Risk test file

docs/
  PHASE3_ENHANCEMENT.md        # Design doc for the self-validation pass (not yet implemented)
```

---

## Accuracy Improvement Phases

### Phase 1 — Richer parser (implemented)
- Cell `numFmt` extracted per cell (e.g. `#,##0.00` → NUMBER, `DD/MM/YYYY` → DATE)
- Cell comments/notes extracted
- Excel named ranges extracted and passed to the AI
- Multi-level header rows detected (`headerRows: number[]`)

### Phase 2 — Finance-aware prompting (implemented)
- Stable finance domain system prompt (prompt-cache friendly)
- Per-column dominant numFmt summary included in prompt
- Named ranges surfaced as canonical table boundaries
- Cell comments included as column-level hints
- Two-stage Claude call: Stage 1 identifies table structure in prose → Stage 2 generates schema JSON seeded from Stage 1 analysis

### Phase 3 — Self-validation pass (documented, not implemented)
See [`docs/PHASE3_ENHANCEMENT.md`](docs/PHASE3_ENHANCEMENT.md) for the design. Adds a third Claude call that cross-checks the generated schema against raw cell samples and auto-corrects type/nullable mismatches before presenting to the user.

---

## Environment Variables Reference

| Variable | Required | Description |
|----------|----------|-------------|
| `AI_MODE` | Yes | `claude` or `mock` |
| `DEMO_MODE` | Yes | `true` — keeps execution in dry-run |
| `ANTHROPIC_API_KEY` | When `AI_MODE=claude` | Your Anthropic API key |
| `UPSTASH_REDIS_REST_URL` | No | Redis URL for persistent job store (falls back to in-memory) |
| `UPSTASH_REDIS_REST_TOKEN` | No | Redis auth token |
