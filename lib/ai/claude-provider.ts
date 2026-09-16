import Anthropic from '@anthropic-ai/sdk'
import { SchemaInferenceProvider, WorkbookAnalysis, InferSchemaResult } from './provider'
import { WorkbookSchema } from '@/lib/schema/types'
import { WorkbookSchemaZod } from '@/lib/schema/zod-schemas'
import { AnalyzedSheet } from '@/lib/excel/region-detector'
import { CellData } from '@/lib/excel/parser'
import { Skill, SuggestedSkill } from '@/lib/skills/types'

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

// ─── System prompts ──────────────────────────────────────────────────────────

const SEMANTIC_SYSTEM_PROMPT = `You are a senior financial data analyst with deep expertise in investment banking EUC workbooks, with specific knowledge of how firms like Morgan Stanley, Goldman Sachs, JPMorgan, and Barclays structure their internal Excel reports.

Your job is to look at the RAW CELL LAYOUT of a workbook and determine the BUSINESS MEANING of each sheet — not how to store it, but what it actually represents in an investment bank context. Your output drives all downstream schema generation; be precise and use correct banking terminology.

## Investment bank business divisions and org hierarchy

### Front Office — Revenue-generating desks
- **ISG / Institutional Securities Group**: Equities, Fixed Income, FX, Commodities, Prime Brokerage, M&A, ECM (Equity Capital Markets), DCM (Debt Capital Markets), Structured Products
- **WM / Wealth Management**: FA (Financial Advisor) teams, Client assets (AUM/AUA), fee income, lending book
- **IM / Investment Management**: Fund strategies (long-only, alternatives, multi-asset), AUM by strategy
- **IB / Investment Banking**: Advisory (M&A, restructuring), Capital Markets (IPO, bonds, rights issues)

### Middle / Back Office — Control and support
- **Risk**: Market Risk, Credit Risk, Counterparty Risk (CCR), Operational Risk, Liquidity Risk, Model Risk
- **Finance / CFO**: P&L reporting, cost allocation, management accounts, regulatory capital
- **Treasury**: ALM (Asset Liability Management), IRRBB, funding, liquidity, collateral
- **Operations**: Trade settlement, confirmations, reconciliations, fails
- **Compliance / Legal**: Regulatory reporting, MiFID II, Dodd-Frank, KYC/AML

### Common BU / Cost Centre naming patterns in bank EUCs
- Division codes: FID (Fixed Income Division), IED (Investment & Enterprise Division), BRM (Business Risk Management), GBM (Global Banking & Markets), GWM (Global Wealth Management), GMD (Global Markets Division)
- Desk codes: typically 3–6 uppercase letters or alphanumeric codes (e.g. FXSPOT, CMMODITY, EQSTRAT)
- Cost centre codes: typically 5–7 digit numeric codes or alphanumeric (e.g. 10421, CC-FICC-01)
- Legal entity codes: e.g. MSCO (Morgan Stanley & Co), MSBNA (MS Bank NA), MSIUK (MS International UK)

## Investment bank EUC taxonomy — recognise these immediately

### Trade and position data
- Trade ID / Deal ID / Reference Number — VARCHAR, usually alphanumeric
- Counterparty / Client Name, LEI (Legal Entity Identifier, 20-char alphanumeric) — VARCHAR
- Instrument type: Spot, Forward, Swap, Option, Bond, Equity, Loan, CDS, IRS, FRA — VARCHAR
- ISIN (12-char), CUSIP (9-char), SEDOL (7-char), Bloomberg ticker — VARCHAR
- Notional / Face Value, Market Value, MTM (Mark-to-Market) — NUMBER
- Settlement Date, Trade Date, Maturity / Expiry Date — DATE
- Currency / CCY pair (e.g. USD/EUR, GBP) — VARCHAR

### Risk metrics
- VaR (Value at Risk) — NUMBER, typically USD/GBP thousands or millions
- CVA (Credit Valuation Adjustment), DVA, FVA, XVA — NUMBER
- PFE (Potential Future Exposure), EAD (Exposure at Default), LGD, PD — NUMBER or FLOAT
- RWA (Risk-Weighted Assets) — NUMBER
- DV01, PV01, CS01, IR01 — NUMBER (basis point sensitivities)
- Delta, Gamma, Vega, Theta, Rho — NUMBER (options Greeks)
- Stress test scenarios (1-day, 10-day, 99th percentile) — NUMBER
- Concentration limits and utilisation (used/limit/headroom) — NUMBER / FLOAT

### Capital and regulatory
- Basel III/IV: CET1, Tier 1, Total Capital ratios — FLOAT
- Leverage Ratio, LCR (Liquidity Coverage Ratio), NSFR — FLOAT
- FRTB (Fundamental Review of Trading Book): SA-CCR, IMA — NUMBER
- CCAR / DFAST stress test exposures — NUMBER
- RWA by risk type (Credit, Market, Operational) — NUMBER

### Finance and management accounts
- Net Revenue / Net Interest Income / Fee Income / Commission — NUMBER
- Cost / Expense by category (Compensation, Non-Comp, Technology, Occupancy) — NUMBER
- Cost-to-Income Ratio (CIR) — FLOAT (0–1 or 0%–100%)
- Return on Equity (ROE), Return on Assets (ROA) — FLOAT
- Headcount by division/desk/grade (FTE — Full-Time Equivalent) — INTEGER
- Budget vs Actuals vs Forecast vs Prior Year — SCENARIO pivot dimension

### Credit and counterparty
- Credit Exposure (current + potential), Limit, Utilisation, Headroom — NUMBER
- Internal Rating (e.g. 1–10 scale, or letter ratings AAA–D) — VARCHAR or INTEGER
- External Rating (Moody's: Aaa–C, S&P/Fitch: AAA–D) — VARCHAR
- Sector / Industry (GICS codes or names), Country, Region — VARCHAR
- Probability of Default (PD), Loss Given Default (LGD) — FLOAT
- Migration matrix: from-rating rows × to-rating columns — CROSSTAB

## Layout signals specific to investment bank EUCs

### Pivot/matrix detection
- 4-digit years (2020–2029) as column headers → FISCAL_YEAR pivot (INTEGER)
- "YYYY Qn" / "Q1 FY25" / "Q1 25" → FISCAL_YEAR + QUARTER split pivot
- Month abbreviations (Jan, Feb, … Dec) as columns → MONTH pivot (VARCHAR)
- "Actual", "Budget", "Forecast", "Plan", "Prior Year", "Variance", "Reforecast" → SCENARIO pivot (VARCHAR)
- Rating categories (AAA, AA, A, BBB, BB, B, CCC, D) as both row AND column → transition/migration matrix CROSSTAB
- Currency codes (USD, EUR, GBP, JPY…) as columns → CURRENCY pivot
- Risk type labels (Market, Credit, Operational, Liquidity) as columns → RISK_TYPE pivot
- Desk or business unit codes as columns → DESK or BU pivot

### Row structure signals in bank EUCs
- Bold merged row spanning all columns with a division name (FID, IED, GBM) → section header
- "Total", "Sub-Total", "Grand Total", "FID Total", "[Division] Total" → aggregate row
- Rows labelled "Limit", "Utilisation", "Headroom" stacked vertically for same counterparty → multi-metric pattern (flag this)
- First rows containing report date, "as at DD/MM/YYYY", "USD millions", version/author → metadata, not data
- Rows with rating or bucket labels followed by numeric ranges (e.g. "1-3", "4-6", "7-10") → lookup/risk band

### Units and scale
- Titles containing "USD '000s", "USD m", "USD bn", "GBP m" → suffix column names accordingly (_USD_K, _USD_M, _USD_BN, _GBP_M)
- "%" or "bps" (basis points) in titles → FLOAT column, note scale in description
- "FTE" → INTEGER headcount column

## Data type inference for bank data
- numFmt "0.00%" → FLOAT (store as 0–1 decimal; do not multiply by 100)
- numFmt "#,##0.00" or "$#,##0" → NUMBER
- numFmt date pattern → DATE
- numFmt "0" or "#,##0" (no decimals) → INTEGER
- Null sentinels: "N/A", "-", "–", "n/a", "#N/A", "n.m.", "nm", "TBD" → NULLABLE

## Merged cells and hierarchies
- In hierarchical BU reports, the top-level division label (e.g. "FID") is typically in a merged cell spanning all its sub-rows. ExcelJS returns the value only for the top-left cell; all others appear blank. Flag isMergedColumn: true so the extractor carries the value forward.
- Multi-level hierarchies: Level 1 = Division (merged), Level 2 = Business Line, Level 3 = Desk — identify all levels and suggest semantic column names (DIVISION_CODE, BUSINESS_LINE, DESK_NAME).`

const SCHEMA_SYSTEM_PROMPT = `You are a senior data engineer specialising in EUC (End User Computing) workbooks produced by investment banks — front office, risk, finance, treasury, and compliance teams. You understand both the banking business and how to model it in Snowflake.

## Excel → Snowflake type mapping
- numFmt "0.00%" or "0%" → FLOAT (store as 0–1 decimal; add "stored as decimal 0-1" to evidence)
- numFmt "#,##0.00", monetary pattern, currency prefix → NUMBER
- numFmt date pattern (dd/mm/yyyy, mm/dd/yy, etc.) → DATE
- numFmt "0" or "#,##0" (no decimals) → INTEGER
- numFmt "@" or free text → VARCHAR
- TRUE/FALSE, Yes/No, 0/1 in boolean context → BOOLEAN
- Date + time cells → TIMESTAMP
- Null sentinels: "N/A", "-", "–", "#N/A", "n/a", "n.m.", "nm", "TBD" → NULLABLE

## Banking column naming conventions
- Monetary amounts: append scale suffix — _USD_K (thousands), _USD_M (millions), _USD_BN (billions), _GBP_M, _EUR_M
- Ratios and percentages: append _PCT or _RATIO — CIR_PCT, LCR_RATIO, PD_PCT
- Basis point sensitivities: use _BPS suffix — DV01_USD_BPS, CS01_BPS
- Headcount: append _FTE — HEADCOUNT_FTE
- Risk metrics: VaR → VAR_USD_M, CVA → CVA_USD_K, RWA → RWA_USD_BN
- Org hierarchy: DIVISION_CODE, BUSINESS_LINE, DESK_CODE, COST_CENTRE_CODE, LEGAL_ENTITY_CODE
- Counterparty: COUNTERPARTY_ID, COUNTERPARTY_NAME, LEI_CODE
- Instruments: TRADE_ID, ISIN, CUSIP, INSTRUMENT_TYPE, ASSET_CLASS
- Dates: TRADE_DATE, SETTLEMENT_DATE, MATURITY_DATE, VALUE_DATE, REPORT_DATE
- Ratings: INTERNAL_RATING, EXTERNAL_RATING_SP, EXTERNAL_RATING_MOODYS, RATING_FROM, RATING_TO (migration matrix)

## Pivot / Crosstab handling (CRITICAL)
When Stage 0 identifies a sheet as PIVOT_MATRIX or contains a matrix component:
1. Set tableType: "CROSSTAB" and isPivot: true
2. Create a FLATTENED schema — one row per (dimension value × hierarchy row combination)
3. Flat column order:
   a. Dimension column(s): FISCAL_YEAR (INTEGER) for year pivots; FISCAL_YEAR + QUARTER (VARCHAR) for "YYYY Qn"; MONTH (VARCHAR) for month pivots; SCENARIO (VARCHAR) for Actual/Budget/Forecast; CURRENCY (VARCHAR) for CCY pivots; RISK_TYPE (VARCHAR) for risk-type pivots
   b. All hierarchy/label columns in depth order — DIVISION_CODE, BUSINESS_LINE, DESK_CODE as applicable
   c. Value column with correct unit suffix
   d. IS_TOTAL_ROW BOOLEAN + SOURCE_ROW_TYPE VARCHAR — always present for pivot tables
4. Populate pivotConfig fully — every field required
5. DO NOT create one column per year/quarter/scenario — normalise into rows

## Rating migration / transition matrices
- Rows = FROM_RATING (e.g. AAA, AA, A, BBB, BB, B, CCC, D)
- Columns = TO_RATING (same values)
- Flatten to: FROM_RATING (VARCHAR), TO_RATING (VARCHAR), MIGRATION_PROBABILITY (FLOAT)
- Set isPivot: true, tableType: "CROSSTAB", dimensionColumnName: "TO_RATING", dimensionType: "CATEGORY"

## Naming rules
- tableName: UPPER_SNAKE_CASE from sheet name + business context (e.g. CREDIT_EXPOSURE_BY_SECTOR, FX_TRADE_BLOTTER, REVENUE_BY_DIVISION)
- Column names: semantic investment bank terminology, never COL_A or COLUMN_1
- Use Stage 0 names exactly unless a banking-standard name is clearly better

## Output rules
- dataType: VARCHAR | NUMBER | INTEGER | FLOAT | BOOLEAN | DATE | TIMESTAMP
- confidence 0–1: numFmt carries most weight; cell sample values second
- evidence: 2–3 concise strings per column (mention numFmt, header text, sample values)
- Include "userModified": false on every column
- MULTI_TABLE sheets: emit one table entry per sub-table, each with own sourceRange`

// ─── Grid renderer (Stage 0 input) ───────────────────────────────────────────

function colLetter(n: number): string {
  let result = ''
  while (n > 0) { n--; result = String.fromCharCode(65 + (n % 26)) + result; n = Math.floor(n / 26) }
  return result
}

function buildGridDump(sheet: AnalyzedSheet, maxRows = 40): string {
  const allRows = Array.from(new Set(sheet.cells.map((c) => c.row))).sort((a, b) => a - b)
  const rowsToShow = allRows.slice(0, maxRows)

  const mergedSet = new Set<string>()
  for (const m of sheet.mergedCells ?? []) {
    for (let r = m.top; r <= m.bottom; r++) {
      for (let c = m.left; c <= m.right; c++) {
        if (r !== m.top || c !== m.left) mergedSet.add(`${r}:${c}`)
      }
    }
  }

  const lines: string[] = [`=== Sheet: "${sheet.name}" (${sheet.rowCount} rows × ${sheet.colCount} cols) ===`]

  for (const rowNum of rowsToShow) {
    const cells = sheet.cells.filter((c) => c.row === rowNum).sort((a, b) => a.col - b.col)
    if (cells.length === 0) { lines.push(`Row ${rowNum}: [empty]`); continue }

    const isMergedSpan = (r: number, c: number) => mergedSet.has(`${r}:${c}`)
    const isMergeStart = sheet.mergedCells?.some((m) => m.top === rowNum && m.left === cells[0]?.col)
    const isBoldRow = cells.every((c) => (c as CellData & { bold?: boolean }).bold)

    const cellStrs = cells
      .filter((c) => !isMergedSpan(c.row, c.col))
      .map((c) => {
        const bold = (c as CellData & { bold?: boolean }).bold ? '*' : ''
        const val = c.value === null ? '' : JSON.stringify(c.value)
        const fmt = c.numFmt ? ` [${c.numFmt}]` : ''
        return `${bold}${colLetter(c.col)}${rowNum}:${val}${fmt}${bold}`
      })

    const mergeNote = isMergeStart ? ' (merged/span)' : ''
    const boldNote = isBoldRow ? ' ← BOLD ROW' : ''
    lines.push(`Row ${String(rowNum).padStart(3)}: ${cellStrs.join('  ')}${mergeNote}${boldNote}`)
  }

  if (allRows.length > maxRows) {
    lines.push(`... (${allRows.length - maxRows} more rows not shown)`)
  }

  return lines.join('\n')
}

function buildStage0Prompt(input: WorkbookAnalysis): string {
  const grids = input.sheets.map((s) => buildGridDump(s)).join('\n\n')

  return `Workbook: "${input.fileName}" (${input.sheets.length} sheets, ${Math.round(input.fileSize / 1024)} KB)

${grids}

## Your task — Semantic Pre-Analysis

Analyse every sheet and return a JSON array (one entry per sheet) describing the business semantics of each sheet. Your output drives all downstream schema generation — be precise.

[
  {
    "sheetName": "exact sheet name as it appears in the workbook",

    "structureType": one of:
      "FLAT_TABLE"        — standard row-per-record table with labelled columns
      "PIVOT_MATRIX"      — values spread across column headers (years, months, scenarios, regions, etc.)
      "HIERARCHICAL_LIST" — indented/grouped rows with parent-child structure in label columns
      "MULTI_TABLE"       — multiple distinct tables on a single sheet (describe each in tables array)
      "LOOKUP"            — reference/mapping/config table (code → label, ID → description)
      "DASHBOARD"         — KPI tiles or metrics display; low extraction value
      "METADATA"          — cover page, instructions, version notes; no tabular data
      "UNKNOWN"           — cannot determine,

    "businessPurpose": "one sentence: what business question does this sheet answer, using domain language from the cell content",
    "workbookDomain": "infer from content using investment bank terminology, e.g. Revenue Planning | Headcount & Compensation | Credit Risk | Market Risk | Counterparty Risk | Trade Blotter | P&L Attribution | Capital & RWA | Liquidity & Treasury | Regulatory Reporting (CCAR/FRTB/COREP) | FX Exposure | Prime Brokerage | M&A Pipeline | Cost Allocation | Rating Migration",

    "metadataRows": [row numbers of title/label/note rows above the actual table — not data],
    "headerRow": <integer row number of the column-label header row, or null if none>,
    "dataStartRow": <integer: first row containing actual data values>,
    "dataEndRow": <integer: last row containing actual data values>,

    "rowDimensions": [
      {
        "sourceCol": "A",
        "businessName": "Plain English label, e.g. 'Business Division', 'Country', 'Product Name'",
        "suggestedColumnName": "UPPER_SNAKE_CASE, e.g. DIVISION, COUNTRY_CODE, PRODUCT_NAME",
        "dataType": "VARCHAR|INTEGER|NUMBER|FLOAT|DATE|BOOLEAN",
        "isMergedColumn": true/false,
        "description": "what this column represents; decode any abbreviations visible in the data (e.g. 'FID = Fixed Income Division', 'EMEA = Europe Middle East Africa')"
      }
    ],

    "pivotDimension": {
      "headerRow": <row number containing pivot column headers>,
      "startCol": "C",
      "endCol": "F",
      "sampleValues": ["2022", "2023", "2024", "2025"],
      "semanticCategory": one of (this is the BUSINESS meaning, not a storage type):
        "FISCAL_YEAR"    — 4-digit year values (2020, 2021…) — storage: INTEGER
        "CALENDAR_YEAR"  — calendar years distinct from fiscal year — storage: INTEGER
        "QUARTER"        — quarter values (Q1, Q2, Q1 FY25, 2024-Q3) — storage: VARCHAR
        "MONTH"          — month names or abbreviations (Jan, Feb… / January…) — storage: VARCHAR
        "YEAR_MONTH"     — combined year+month (2024-01, Jan-24) — storage: VARCHAR
        "SCENARIO"       — Actual/Budget/Forecast/Plan/Variance/Reforecast/Prior Year — storage: VARCHAR
        "REGION"         — bank regions: EMEA, APAC, Americas, NAMR, LATAM — storage: VARCHAR
        "CURRENCY"       — ISO currency codes (USD, EUR, GBP, JPY) as columns — storage: VARCHAR
        "RISK_TYPE"      — risk categories (Market, Credit, Operational, Liquidity) — storage: VARCHAR
        "RATING_BUCKET"  — rating migration/transition matrix TO columns (AAA, AA…) — storage: VARCHAR
        "ASSET_CLASS"    — asset class codes as columns (Equities, Fixed Income, FX, Rates…) — storage: VARCHAR
        "CATEGORY"       — any other repeating categorical dimension not covered above — storage: VARCHAR,
      "suggestedColumnName": "e.g. FISCAL_YEAR, MONTH, SCENARIO, REGION — UPPER_SNAKE_CASE",
      "storageType": "INTEGER (for years only) | VARCHAR (for everything else)",
      "splitIntoColumns": false,
      "splitColumns": ["FISCAL_YEAR", "QUARTER"]
    },

    "metric": {
      "businessName": "plain English metric name, e.g. 'Revenue', 'Headcount', 'Score'",
      "unit": "unit from sheet title or context — use bank conventions: 'USD thousands' → _USD_K, 'USD millions' → _USD_M, 'USD billions' → _USD_BN, 'GBP millions' → _GBP_M, 'FTE' → _FTE, '%' → _PCT, 'bps' → _BPS, or null",
      "suggestedColumnName": "UPPER_SNAKE_CASE with bank-standard unit suffix: REVENUE_USD_K, NET_REVENUE_USD_M, HEADCOUNT_FTE, VAR_USD_M, CIR_PCT, DV01_USD_BPS, RWA_USD_BN",
      "dataType": "NUMBER|INTEGER|FLOAT",
      "description": "what the value cells represent and how to interpret them"
    },

    "specialRows": [
      {"pattern": "regex or literal that appears in any row label to identify this row type", "type": "SECTION_HEADER|SUBTOTAL|GRAND_TOTAL|NOTE|SPACER", "description": "why these rows are structural not data"}
    ],

    "tables": [
      {
        "label": "short name for this sub-table, e.g. 'Summary' or 'Detail'",
        "headerRow": <integer>,
        "dataStartRow": <integer>,
        "dataEndRow": <integer>,
        "startCol": "A",
        "endCol": "F"
      }
    ]
  }
]

Rules:
- Set pivotDimension to null for FLAT_TABLE, LOOKUP, METADATA, DASHBOARD sheets.
- Set metric to null for flat tables with multiple typed value columns (each column describes itself).
- Set tables to [] for non-MULTI_TABLE sheets.
- isMergedColumn: true if the label column uses Excel merged cells spanning multiple rows (the value belongs to all rows in the merge group, not just the first).
- splitIntoColumns: true only if pivot headers contain BOTH a year and a period (e.g. "2024 Q1") — in that case set splitColumns to the two suggested column names.
- Row numbers in all fields are 1-based and match the grid dump exactly. These numbers are used directly for data extraction — precision matters.
- Decode abbreviations and org-specific codes you can infer from context (will be stored in descriptions for downstream use).`
}

// ─── Stage 1: structure identification (uses semantic context) ────────────────

function buildWorkbookContext(input: WorkbookAnalysis): string {
  const namedRangesStr = input.namedRanges?.length
    ? `\n## Named ranges:\n` + input.namedRanges.map((nr) => `  ${nr.name}: ${nr.sheet}!${nr.range}`).join('\n')
    : ''

  const sheetSummaries = input.sheets.map((sheet: AnalyzedSheet) => {
    const dataRegion = sheet.primaryDataRegion
    const headerRows = sheet.headerRows?.length ? sheet.headerRows : sheet.headerRow !== null ? [sheet.headerRow] : []

    const headers = headerRows.length > 0
      ? headerRows.map((hr) => {
          const rowCells = sheet.cells.filter((c) => c.row === hr).sort((a, b) => a.col - b.col)
          return `  Header row ${hr}: ` + rowCells.map((c) => `${colLetter(c.col)}:"${c.value}"`).join(', ')
        }).join('\n')
      : '  No header detected'

    const colFormats: Record<string, Record<string, number>> = {}
    if (dataRegion) {
      sheet.cells
        .filter((c) => c.row >= dataRegion.startRow && c.row <= dataRegion.endRow && c.numFmt)
        .forEach((c) => {
          const col = colLetter(c.col)
          if (!colFormats[col]) colFormats[col] = {}
          colFormats[col][c.numFmt!] = (colFormats[col][c.numFmt!] ?? 0) + 1
        })
    }
    const numFmtStr = Object.entries(colFormats)
      .map(([col, fmts]) => {
        const [fmt] = Object.entries(fmts).sort((a, b) => b[1] - a[1])[0]
        return `${col}:"${fmt}"`
      }).join(', ')

    return [
      `Sheet: "${sheet.name}" (${sheet.rowCount}r × ${sheet.colCount}c)`,
      `  Data region: ${dataRegion ? `rows ${dataRegion.startRow}–${dataRegion.endRow}, cols ${colLetter(dataRegion.startCol)}–${colLetter(dataRegion.endCol)}` : 'none'}`,
      headers,
      numFmtStr ? `  numFmts: ${numFmtStr}` : '',
    ].filter(Boolean).join('\n')
  }).join('\n\n')

  return `Workbook: "${input.fileName}" (${Math.round(input.fileSize / 1024)} KB, ${input.sheets.length} sheets)${namedRangesStr}\n\n${sheetSummaries}`
}

function buildStage1Prompt(input: WorkbookAnalysis, semanticContext: string, skills?: Skill[]): string {
  const skillsBlock = skills && skills.length > 0 ? buildSkillsContext(skills) : ''

  return `${buildWorkbookContext(input)}

## Semantic Pre-Analysis (from Stage 0 — trust this over heuristic detection)
${semanticContext}
${skillsBlock ? `\n${skillsBlock}` : ''}

## Stage 1 — Table identification

For every sheet that contains extractable tabular data (skip METADATA, DASHBOARD, UNKNOWN):
- Confirm or correct the Stage 0 structureType; note any disagreements and why
- State the exact header row and data range in Excel notation (e.g. A8:F26)
- For FLAT_TABLE: list each column with its letter, header label, numFmt (if any), and inferred Snowflake type
- For PIVOT_MATRIX: confirm dimensionColumnName, all hierarchy column names, value column name, and pivotConfig coordinates from Stage 0; flag any merged-cell columns that need carry-forward
- For HIERARCHICAL_LIST: identify the hierarchy depth and confirm which columns represent which level
- For MULTI_TABLE: list each sub-table range and structure independently
- For LOOKUP: identify the key column and value column(s)
- Call out any columns that are ambiguous (mixed types, sparse data, unclear header) — describe the issue so Stage 2 can resolve it with a conservative type choice
- Use numFmt evidence from the workbook context above and Stage 0 semantic analysis to justify all type choices`
}

function buildStage2Prompt(): string {
  return `## Stage 2 — Generate Snowflake schema JSON

Using your Stage 0 semantic understanding and Stage 1 analysis, output the complete schema as valid JSON (no markdown fences, no commentary outside the JSON):

{
  "workbookName": "<filename>",
  "tables": [
    {
      "tableName": "UPPER_SNAKE_CASE",
      "description": "...",
      "sourceSheet": "exact sheet name",
      "sourceRange": "A8:F26",
      "tableType": "TRANSACTIONAL|LOOKUP|SUMMARY|CROSSTAB",
      "isPivot": false,
      "confidence": 0.95,
      "columns": [
        {
          "name": "COL_NAME",
          "sourceColumn": "A",
          "sourceRange": "A2:A100",
          "dataType": "VARCHAR",
          "nullable": true,
          "confidence": 0.92,
          "evidence": ["reason 1", "reason 2"],
          "userModified": false
        }
      ]
    }
  ]
}

For pivot/CROSSTAB tables, add:
"isPivot": true,
"pivotConfig": {
  "dimensionColumnName": "FISCAL_YEAR",
  "dimensionType": "INTEGER",         // STORAGE TYPE ONLY — must be exactly "INTEGER" or "VARCHAR". Never a semantic name like "QUARTER" or "SCENARIO".
  "headerRow": 8,
  "hierarchySourceCols": ["A", "B"],
  "hierarchyColumnNames": ["DIVISION_CODE", "BUSINESS_UNIT"],
  "carryForwardHierarchyCols": [true, false],
  "valueColumnName": "REVENUE_USD_K",
  "dataStartRow": 9,
  "dataEndRow": 26,
  "pivotStartCol": "C",
  "pivotEndCol": "F",
  "excludePatterns": [],
  "totalPatterns": ["Total", "Sub-Total", "Sub Total"],
  "sectionHeaderPatterns": [],
  "rowTypeColumnName": "SOURCE_ROW_TYPE",
  "isTotalColumnName": "IS_TOTAL_ROW"
}

CRITICAL: pivotConfig.dimensionType is a Snowflake STORAGE type — the ONLY allowed values are the literal strings "INTEGER" and "VARCHAR". Do NOT copy the Stage 0 semanticCategory (QUARTER, SCENARIO, RATING_BUCKET, etc.) here — those are business categories, not storage types. Map as follows:
- Stage 0 semanticCategory FISCAL_YEAR or CALENDAR_YEAR → pivotConfig.dimensionType: "INTEGER"
- Every other semanticCategory (QUARTER, MONTH, YEAR_MONTH, SCENARIO, REGION, CURRENCY, RISK_TYPE, RATING_BUCKET, ASSET_CLASS, CATEGORY) → pivotConfig.dimensionType: "VARCHAR"
The business meaning belongs in dimensionColumnName (e.g. "QUARTER", "SCENARIO", "TO_RATING") — not in dimensionType.

Rules for carryForwardHierarchyCols:
- Set true for any hierarchy column where the value is stored in a MERGED CELL that spans multiple rows (e.g. a division label "FID" merged across all its sub-rows). ExcelJS only returns the value in the top-left cell of a merge; all other cells in the merge are blank. Carry-forward fills those blanks with the last seen non-empty value so every row gets the correct label.
- Set false for columns where each row has its own distinct value (e.g. the leaf-level business unit name).

Rules for totalPatterns / isTotalColumnName / rowTypeColumnName:
- Do NOT use excludePatterns to drop total rows — include them with IS_TOTAL_ROW=true so analysts can filter or aggregate as needed.
- totalPatterns should match subtotal row labels (any hierarchy column value). Grand Total rows are auto-detected.
- rowTypeColumnName emits: DATA | SUBTOTAL | GRAND_TOTAL | SECTION_HEADER per row.
- isTotalColumnName emits: true for SUBTOTAL and GRAND_TOTAL rows, false otherwise.
- Add IS_TOTAL_ROW (BOOLEAN) and SOURCE_ROW_TYPE (VARCHAR) to the columns array when these fields are set.

The columns array for pivot tables must describe the FLATTENED schema: dimension column + hierarchy columns + value column + IS_TOTAL_ROW + SOURCE_ROW_TYPE. NOT one column per year.`
}

function buildStage3Prompt(existingRules: string[]): string {
  const existing = existingRules.length > 0
    ? `\nExisting rules (do NOT re-suggest):\n${existingRules.map((r) => `- ${r}`).join('\n')}\n`
    : ''
  return `## Stage 3 — Suggest skills
${existing}
Suggest 0–3 reusable rules that would improve future inferences for similar workbooks from this bank. Focus on:
- Division/desk abbreviations decoded (e.g. "FID = Fixed Income Division", "IED = Investment & Enterprise Division", "BRM = Business Risk Management")
- Org-specific cost centre format or naming convention (e.g. "cost centres are 5-digit numeric codes")
- Legal entity codes seen (e.g. "MSCO = Morgan Stanley & Co LLC")
- Bank-specific period format (e.g. "quarters written as Q1 FY25 — fiscal year runs Oct–Sep")
- Structural patterns (e.g. "all division-level EUCs have a metadata header block in rows 1–3", "bold merged rows = division section headers throughout")
- Data type edge cases specific to this bank (e.g. "CIR stored as raw ratio 0–1 not %, despite % formatting", "VaR figures in USD millions even when header says USD '000s")

Only capture non-obvious, bank-specific rules that would NOT be self-evident from column headers alone.

Output as JSON array ([] if nothing worth capturing):
[{"name":"...","category":"ORG_CONTEXT|COLUMN_NAMING|DATA_TYPE_RULE|PERIOD_FORMAT|STRUCTURE_RULE","rule":"...","examples":[],"confidence":0.0,"reason":"..."}]`
}

export function buildSkillsContext(skills: Skill[]): string {
  const enabled = skills.filter((s) => s.enabled)
  if (enabled.length === 0) return ''
  const grouped: Record<string, Skill[]> = {}
  for (const skill of enabled) {
    if (!grouped[skill.category]) grouped[skill.category] = []
    grouped[skill.category].push(skill)
  }
  const lines = ['## Organisation-specific rules (apply to all inferences)']
  for (const [cat, catSkills] of Object.entries(grouped)) {
    lines.push(`\n### ${cat}`)
    for (const s of catSkills) {
      lines.push(`- ${s.rule}`)
      if (s.examples?.length) lines.push(`  Examples: ${s.examples.join('; ')}`)
    }
  }
  return lines.join('\n')
}

// ─── Provider ─────────────────────────────────────────────────────────────────

export class ClaudeSchemaInferenceProvider implements SchemaInferenceProvider {
  async inferSchema(input: WorkbookAnalysis, skills?: Skill[]): Promise<InferSchemaResult> {

    // ── Stage 0: Semantic pre-pass ────────────────────────────────────────────
    // Separate system prompt — this is a business analyst, not a schema engineer
    let semanticContext = ''
    try {
      const stage0Msg = await client.messages.create({
        model: 'claude-opus-4-7',
        max_tokens: 4096,
        system: SEMANTIC_SYSTEM_PROMPT,
        thinking: { type: 'adaptive' },
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        messages: [{ role: 'user', content: buildStage0Prompt(input) }] as any,
      })
      const stage0Text = stage0Msg.content.find((b) => b.type === 'text')
      if (stage0Text?.type === 'text') {
        let raw = stage0Text.text.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim()
        // Store raw JSON string for Stage 1 context injection
        JSON.parse(raw) // validate it's parseable
        semanticContext = raw
        console.log('[claude] Stage 0 semantic pre-pass complete')
      }
    } catch (err) {
      console.warn('[claude] Stage 0 failed, proceeding without semantic context:', err instanceof Error ? err.message : err)
    }

    // ── Stage 1: Structure identification ────────────────────────────────────
    const stage1Prompt = buildStage1Prompt(input, semanticContext, skills)

    const stage1Msg = await client.messages.create({
      model: 'claude-opus-4-7',
      max_tokens: 4096,
      system: SCHEMA_SYSTEM_PROMPT,
      thinking: { type: 'adaptive' },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      messages: [{ role: 'user', content: stage1Prompt }] as any,
    })

    // ── Stage 2: Schema JSON ──────────────────────────────────────────────────
    const stage2Stream = client.messages.stream({
      model: 'claude-opus-4-7',
      max_tokens: 16000,
      system: SCHEMA_SYSTEM_PROMPT,
      thinking: { type: 'adaptive' },
      messages: [
        { role: 'user', content: stage1Prompt },
        { role: 'assistant', content: stage1Msg.content as Parameters<typeof client.messages.create>[0]['messages'][0]['content'] },
        { role: 'user', content: buildStage2Prompt() },
      ],
    })

    const stage2Message = await stage2Stream.finalMessage()
    const textBlock = stage2Message.content.find((b) => b.type === 'text')
    if (!textBlock || textBlock.type !== 'text') throw new Error('Claude returned no text for schema inference')

    let raw = textBlock.text.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim()
    const parsed = JSON.parse(raw)

    // Defensive normalisation: pivotConfig.dimensionType must be INTEGER or VARCHAR.
    // If Claude leaked a semantic category (QUARTER/SCENARIO/etc.) instead of the storage type, coerce it.
    if (Array.isArray(parsed?.tables)) {
      for (const t of parsed.tables) {
        const dt = t?.pivotConfig?.dimensionType
        if (dt && dt !== 'INTEGER' && dt !== 'VARCHAR') {
          t.pivotConfig.dimensionType = (dt === 'FISCAL_YEAR' || dt === 'CALENDAR_YEAR' || dt === 'YEAR') ? 'INTEGER' : 'VARCHAR'
        }
      }
    }

    const schema = WorkbookSchemaZod.parse(parsed) as WorkbookSchema

    // ── Stage 3: Skill suggestions ────────────────────────────────────────────
    let suggestedSkills: SuggestedSkill[] = []
    try {
      const existingRules = skills?.filter((s) => s.enabled).map((s) => s.rule) ?? []
      const stage3Msg = await client.messages.create({
        model: 'claude-opus-4-7',
        max_tokens: 2048,
        system: SCHEMA_SYSTEM_PROMPT,
        messages: [
          { role: 'user', content: stage1Prompt },
          { role: 'assistant', content: stage1Msg.content as Parameters<typeof client.messages.create>[0]['messages'][0]['content'] },
          { role: 'user', content: buildStage2Prompt() },
          { role: 'assistant', content: stage2Message.content as Parameters<typeof client.messages.create>[0]['messages'][0]['content'] },
          { role: 'user', content: buildStage3Prompt(existingRules) },
        ],
      })
      const s3Text = stage3Msg.content.find((b) => b.type === 'text')
      if (s3Text?.type === 'text') {
        let s3Raw = s3Text.text.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim()
        suggestedSkills = JSON.parse(s3Raw) as SuggestedSkill[]
      }
    } catch {
      suggestedSkills = []
    }

    return { schema, suggestedSkills }
  }
}
