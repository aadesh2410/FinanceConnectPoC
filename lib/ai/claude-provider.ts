import Anthropic from '@anthropic-ai/sdk'
import { SchemaInferenceProvider, WorkbookAnalysis, InferSchemaResult } from './provider'
import { WorkbookSchema } from '@/lib/schema/types'
import { WorkbookSchemaZod } from '@/lib/schema/zod-schemas'
import { AnalyzedSheet } from '@/lib/excel/region-detector'
import { CellData } from '@/lib/excel/parser'
import { Skill, SuggestedSkill } from '@/lib/skills/types'

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

// ─── System prompts ──────────────────────────────────────────────────────────

const SEMANTIC_SYSTEM_PROMPT = `You are an expert business data analyst who reads Excel workbooks from any industry or function — finance, HR, sales, operations, supply chain, project management, regulatory, or general corporate planning.

Your job is to look at the RAW CELL LAYOUT of a workbook and determine the BUSINESS MEANING of each sheet — not how to store it, but what it actually represents. Your output is consumed by a schema engineer in the next step; be precise and comprehensive.

## What to determine for each sheet

1. **What does this sheet answer?** — Revenue by region? Headcount by department? Project milestones? Risk ratings?
2. **What is the structural layout?** — Flat table, pivot/matrix, hierarchical list, lookup/reference, dashboard, or metadata?
3. **What are the row dimensions?** — What do row labels mean (business units, employees, products, projects, countries, risk buckets)?
4. **What are the column headers?** — Are they field names (flat table) or dimensional VALUES (years, months, quarters, scenarios, regions, products)?
5. **What is being measured?** — The metric, its unit, and scale (e.g. "Revenue in USD thousands", "Headcount in FTE", "Score 0–100")
6. **Which rows are structural, not data?** — Section headers, subtotals, grand totals, notes, spacer rows

## Universal layout signals

### Pivot/matrix detection (column headers are VALUES, not field names)
- 4-digit years (2020, 2021…) → FISCAL_YEAR or CALENDAR_YEAR pivot
- "YYYY Qn" / "Q1 FY25" / "Q1-25" → QUARTER pivot (may need year+quarter split)
- Month names or abbreviations (Jan, Feb… / January…) → MONTH pivot
- "Actual", "Budget", "Forecast", "Variance", "Plan", "Prior Year" → SCENARIO pivot
- Region names (EMEA, APAC, Americas, North, South) → REGION pivot
- Product/SKU codes or names as columns → PRODUCT pivot
- Department or cost-centre codes as columns → DEPARTMENT pivot
- Any repeating categorical values as columns → CATEGORY pivot (set dimensionType: "CATEGORY")

### Row structure signals
- Bold row with all/most cells merged across columns → section header, not data
- "Total", "Sub-Total", "Grand Total", "Subtotal", "Sum" in any row label → aggregate row
- Blank rows between groups → visual separator, skip
- Rows with only the first cell filled, all data cells blank → section header
- Italic, grey, or indented rows → often notes or sub-items
- Very first row(s) before a clear header → title / metadata

### Data type signals from cell format (numFmt)
- "0.00%" or "0%" → FLOAT (ratio/percentage)
- "#,##0.00" or "$#,##0" or monetary pattern → NUMBER
- Date display format → DATE
- "0" or "#,##0" (integers, no decimals) → INTEGER
- Free text → VARCHAR
- TRUE/FALSE, Yes/No, 0/1 with boolean context → BOOLEAN

### Multi-table sheets
- A single sheet may contain MULTIPLE separate tables (e.g. summary table + detail table)
- Detect each independently; signal via structureType: "MULTI_TABLE"

### Hierarchy depth
- Multiple adjacent label columns that form a hierarchy (Level 1 → Level 2 → Level 3) — identify each level and suggest descriptive column names (do NOT use generic COL_A)
- Merged cells in label columns indicate the value applies to all rows below until the next non-blank — this is carry-forward merging

## Domain-agnostic examples of business column naming
- Org hierarchy: DIVISION, DEPARTMENT, TEAM, COST_CENTER, LEGAL_ENTITY
- Geography: REGION, COUNTRY, SITE, TERRITORY
- Time: FISCAL_YEAR, CALENDAR_YEAR, QUARTER, MONTH, PERIOD
- Finance: REVENUE, COST, HEADCOUNT, BUDGET, ACTUALS, VARIANCE, RATIO
- Projects: PROJECT_CODE, MILESTONE, STATUS, OWNER, DUE_DATE
- Products: PRODUCT_CODE, CATEGORY, SKU, SEGMENT
- Risk: RATING, SCORE, PROBABILITY, EXPOSURE, TIER

Do NOT hard-code domain assumptions — infer from actual cell content and apply these patterns generically.`

const SCHEMA_SYSTEM_PROMPT = `You are a senior data engineer specialising in EUC (End User Computing) workbooks from any business domain — finance, HR, sales, operations, supply chain, legal, or general corporate.

## Excel → Snowflake type mapping (apply universally)
- numFmt "0.00%" or "0%" → FLOAT (store as decimal 0–1; note % display in description)
- numFmt "#,##0.00", monetary pattern, or currency prefix → NUMBER
- numFmt date pattern (dd/mm/yyyy, mm/dd/yy, etc.) → DATE
- numFmt "0" or "#,##0" (no decimals) → INTEGER
- numFmt "@" or text-only cells → VARCHAR
- TRUE/FALSE, Yes/No, 1/0 in boolean context → BOOLEAN
- Timestamp patterns (date + time) → TIMESTAMP
- Null sentinels: "N/A", "-", "–", "#N/A", "n/a", "TBD" → NULLABLE
- Named ranges mark canonical table boundaries — prefer their extent over heuristics

## Pivot / Crosstab handling (CRITICAL)
When Stage 0 identifies a sheet as PIVOT_MATRIX or MULTI_TABLE with a matrix component:
1. Set tableType: "CROSSTAB" and isPivot: true
2. Create a FLATTENED schema — one row per (dimension value × hierarchy row combination)
3. Flat column order:
   a. Dimension column(s) — what was spread across column headers (FISCAL_YEAR, MONTH, SCENARIO, etc.)
   b. All hierarchy/label columns — one per depth level with semantic names from Stage 0
   c. Value column — named from the metric + unit suffix (e.g. REVENUE_USD_K, HEADCOUNT_FTE, SCORE_PCT)
   d. IS_TOTAL_ROW (BOOLEAN) + SOURCE_ROW_TYPE (VARCHAR) — always include for pivot tables
4. If Stage 0 detected "YYYY Qn" or quarter patterns, split into two dimension columns: FISCAL_YEAR (INTEGER) + QUARTER (VARCHAR)
5. If Stage 0 detected SCENARIO pivot (Actual/Budget/Forecast), dimension column is SCENARIO (VARCHAR)
6. Populate pivotConfig fully — every field must be set
7. DO NOT create one column per year/period/scenario — that defeats normalisation

## Naming rules
- tableName: UPPER_SNAKE_CASE derived from sheet name and business purpose
- Column names: UPPER_SNAKE_CASE, descriptive (never COL_A, COLUMN_1, or bare letters)
- Always use the semantic names suggested in Stage 0 — override only with justification
- Hierarchy levels: use Stage 0 suggestions (e.g. DIVISION, DEPARTMENT, REGION, PRODUCT_LINE)
- Append unit suffix to numeric column names when unit is known: _USD_K, _GBP_M, _FTE, _PCT, _DAYS, _UNITS

## Output rules
- dataType: VARCHAR | NUMBER | INTEGER | FLOAT | BOOLEAN | DATE | TIMESTAMP
- confidence 0–1: weight numFmt evidence most heavily; cell sample values second
- evidence: 2–3 concise strings per column explaining the type/name decision
- Include "userModified": false on every column
- For MULTI_TABLE sheets: emit one table entry per detected table, each with its own sourceRange`

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
    "workbookDomain": "infer from content, e.g. Revenue Planning | Headcount & HR | Sales Pipeline | Budget & Forecast | Credit Risk | Project Tracker | Regulatory Reporting | Supply Chain | General Ledger | Customer Data | Operations",

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
      "dimensionType": one of:
        "FISCAL_YEAR"    — 4-digit year values (2020, 2021…)
        "CALENDAR_YEAR"  — calendar years
        "QUARTER"        — quarter values (Q1, Q2, Q1 FY25, 2024-Q3)
        "MONTH"          — month names or abbreviations (Jan, February, 01…)
        "YEAR_MONTH"     — combined year+month (2024-01, Jan-24)
        "SCENARIO"       — Actual/Budget/Forecast/Plan/Variance/Prior Year
        "REGION"         — geographic regions (EMEA, APAC, Americas, North, South)
        "DEPARTMENT"     — org unit or cost centre codes as columns
        "PRODUCT"        — product codes or names as columns
        "CATEGORY"       — any other repeating categorical dimension,
      "suggestedColumnName": "e.g. FISCAL_YEAR, MONTH, SCENARIO, REGION — UPPER_SNAKE_CASE",
      "dataType": "INTEGER (for years) | VARCHAR (for everything else)",
      "splitIntoColumns": false,
      "splitColumns": ["FISCAL_YEAR", "QUARTER"]
    },

    "metric": {
      "businessName": "plain English metric name, e.g. 'Revenue', 'Headcount', 'Score'",
      "unit": "unit string from the sheet title or context, e.g. 'USD thousands', 'FTE', '%', 'units', 'days', or null if no unit",
      "suggestedColumnName": "UPPER_SNAKE_CASE with unit suffix: REVENUE_USD_K, HEADCOUNT_FTE, SCORE_PCT, AMOUNT_GBP_M",
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
  "dimensionType": "INTEGER",
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
Suggest 0–3 reusable rules that would improve future inferences for similar workbooks from the same organisation. Focus on non-obvious, org-specific patterns:
- Abbreviations or codes decoded from this workbook (e.g. "FID = Fixed Income Division", "EMEA includes Turkey", "P&L = Profit and Loss")
- Column naming conventions specific to this org (e.g. "headcount columns always use _FTE suffix", "cost centre codes are always 6 digits")
- Data type rules encountered (e.g. "ratio columns use % format but store as 0–1 decimals", "dates appear as text MM/DD/YYYY not date cells")
- Period/time format patterns (e.g. "quarters formatted as 'Q1 FY25'", "fiscal year starts in April")
- Structural patterns (e.g. "each sheet has a metadata block in rows 1–5 before the data table", "bold rows are always section headers with no data values")

Do NOT suggest generic rules already obvious from Excel conventions. Only suggest rules that are specific to this organisation's workbooks.

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
    const schema = WorkbookSchemaZod.parse(JSON.parse(raw)) as WorkbookSchema

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
