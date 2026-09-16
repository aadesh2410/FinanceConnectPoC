import Anthropic from '@anthropic-ai/sdk'
import { SchemaInferenceProvider, WorkbookAnalysis, InferSchemaResult } from './provider'
import { WorkbookSchema } from '@/lib/schema/types'
import { WorkbookSchemaZod } from '@/lib/schema/zod-schemas'
import { AnalyzedSheet } from '@/lib/excel/region-detector'
import { CellData } from '@/lib/excel/parser'
import { Skill, SuggestedSkill } from '@/lib/skills/types'

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

// ─── System prompts ──────────────────────────────────────────────────────────

const SEMANTIC_SYSTEM_PROMPT = `You are a senior financial data analyst expert at reading Excel workbooks used in banking, treasury, and risk management.

Your job is to look at the RAW CELL LAYOUT of a workbook and determine the BUSINESS MEANING of each sheet — not how to store it, but what it actually represents. Focus on:
- What business question does this sheet answer?
- Is it a flat table, a pivot/matrix (years or periods as columns), a hierarchical list, a lookup, or metadata?
- What do the row labels represent from a finance domain perspective?
- What do the column headers represent — are they field names or dimensional values (years, quarters, months)?
- What metric is being tracked? What are its units?
- Which rows are section headers, subtotals, grand totals, or notes — not data rows?

Finance domain knowledge to apply:
- BU/cost centre codes (FID, IED, BRM, GBM, etc.) are business unit hierarchies
- 4-digit years as column headers = pivot on fiscal year
- "YYYY Qn" = pivot on fiscal year + quarter
- Bold rows spanning all columns = section headers
- "Total", "Sub-Total", "Grand Total" rows = aggregates, not raw data
- Currency suffixes in titles ("USD '000s", "GBP m") define the unit for numeric columns
- Confidence/probability values (0.0–1.0 or 0%–100%) = FLOAT, not NUMBER`

const SCHEMA_SYSTEM_PROMPT = `You are a senior financial data engineer specialising in EUC (End User Computing) workbooks used by treasury, risk, and finance teams.

## Finance domain conventions
- FX Exposure: currency pairs, notional amounts, MTM, PnL
- Trade data: trade IDs, counterparty names, settlement dates, instruments (Spot, Forward, Swap, Option)
- Risk parameters: delta, gamma, vega, VaR, DV01, PV01
- Excel numFmt signals:
  - "0.00%" → FLOAT
  - "#,##0.00" or monetary pattern → NUMBER
  - Date pattern → DATE
  - "0" or "#,##0" (no decimals) → INTEGER
  - Text-only → VARCHAR
- Named ranges often mark canonical table boundaries
- Null sentinels: "N/A", "-", "#N/A" → NULLABLE

## Pivot / Crosstab handling (CRITICAL)
When the semantic pre-analysis identifies a sheet as PIVOT or MATRIX:
1. Set tableType: "CROSSTAB" and isPivot: true
2. Create a FLATTENED schema — one row per (dimension value × hierarchy row)
3. Columns must reflect the FLAT output:
   - Dimension column (e.g. YEAR INTEGER, PERIOD VARCHAR, YEAR + QUARTER if "YYYY Qn")
   - One column per hierarchy level (use the semantic names provided)
   - One value column named after the metric + unit (e.g. REVENUE_USD_K, HEADCOUNT_FTE)
4. Populate pivotConfig completely from the semantic pre-analysis
5. DO NOT create one column per year/quarter — that defeats the purpose

## Naming rules
- tableName: UPPER_SNAKE_CASE from sheet name + business context
- Column names: UPPER_SNAKE_CASE, semantic (not COL_A, COL_B)
- Use the semantic names from Stage 0 — do not invent new ones without justification
- Hierarchy levels: use the names suggested (BU_LEVEL_5, DIVISION, COST_CENTER, etc.)

## Output rules
- dataType: VARCHAR | NUMBER | INTEGER | FLOAT | BOOLEAN | DATE | TIMESTAMP
- confidence 0–1: weight numFmt evidence heavily
- evidence: 2–3 concise strings per column
- Include "userModified": false on every column`

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

For each sheet, output a JSON object describing the business semantics. Return a JSON array, one entry per sheet:

[
  {
    "sheetName": "exact sheet name",
    "structureType": "FLAT_TABLE | PIVOT_MATRIX | HIERARCHICAL_LIST | LOOKUP | METADATA | UNKNOWN",
    "businessPurpose": "one sentence describing what this data represents",
    "workbookDomain": "e.g. Revenue Planning, Credit Risk, Trade Exposure",
    "metadataRows": [list of row numbers that are titles/labels/notes, not data],
    "headerRow": <row number of the column header row, or null>,
    "dataStartRow": <first actual data row number>,
    "dataEndRow": <last actual data row number>,
    "rowDimensions": [
      {
        "sourceCol": "A",
        "businessName": "human-readable name, e.g. Business Division",
        "suggestedColumnName": "UPPER_SNAKE_CASE, e.g. BU_LEVEL_5",
        "dataType": "VARCHAR|INTEGER|NUMBER|FLOAT|DATE|BOOLEAN",
        "description": "what this column represents, including any known decode (e.g. FID = Fixed Income Division)"
      }
    ],
    "pivotDimension": {
      "headerRow": <row number containing the pivot column headers>,
      "startCol": "C",
      "endCol": "F",
      "sampleValues": ["2022", "2023", "2024", "2025"],
      "dimensionType": "FISCAL_YEAR | CALENDAR_YEAR | QUARTER | MONTH | PERIOD | CATEGORY",
      "suggestedColumnName": "YEAR",
      "dataType": "INTEGER|VARCHAR",
      "splitIntoColumns": false,
      "splitColumns": []
    },
    "metric": {
      "businessName": "Revenue",
      "unit": "USD '000s",
      "suggestedColumnName": "REVENUE_USD_K",
      "dataType": "NUMBER|INTEGER|FLOAT",
      "description": "what the value cells represent"
    },
    "specialRows": [
      {"pattern": "regex or literal to match row label", "type": "SECTION_HEADER|SUBTOTAL|GRAND_TOTAL|NOTE", "description": "..."}
    ]
  }
]

Set pivotDimension to null for non-pivot sheets. Set metric to null for flat tables with multiple typed columns. Be precise about row numbers — they are used directly for data extraction.`
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
For every sheet that contains tabular data:
- Confirm or correct the Stage 0 structural classification
- State header row(s), data range in Excel notation (e.g. A8:F26)
- For FLAT tables: one line per column with letter, header label, and inferred type
- For PIVOT/MATRIX sheets: confirm the dimension column name, hierarchy column names, and value column name from Stage 0
- Use numFmt evidence and the semantic pre-analysis to justify all type choices`
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
Suggest 0–3 reusable rules to improve future inferences for similar workbooks. Focus on:
- Org-specific terminology discovered (e.g. what "FID" means)
- New structural patterns not covered by existing rules
- Domain-specific type inference rules

Output as JSON array ([] if nothing new):
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
