import Anthropic from '@anthropic-ai/sdk'
import { SchemaInferenceProvider, WorkbookAnalysis, InferSchemaResult } from './provider'
import { WorkbookSchema } from '@/lib/schema/types'
import { WorkbookSchemaZod } from '@/lib/schema/zod-schemas'
import { AnalyzedSheet } from '@/lib/excel/region-detector'
import { CellData } from '@/lib/excel/parser'
import { Skill, SuggestedSkill } from '@/lib/skills/types'

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

// Stable finance domain conventions — suitable for prompt caching
const FINANCE_SYSTEM_PROMPT = `You are a senior financial data engineer specialising in EUC (End User Computing) workbooks used by treasury, risk, and finance teams.

## Finance domain conventions
- FX Exposure: currency pairs (USD/EUR etc.), notional amounts, MTM (mark-to-market), PnL columns
- Trade data: trade IDs, counterparty/entity names, settlement/value dates, instruments (FX Spot, Forward, Swap, Option)
- Risk parameters: delta, gamma, vega, theta, VaR, DV01, PV01
- Excel numFmt signals:
  - "0.00%" → FLOAT (percentage)
  - "$#,##0.00" or "#,##0.00" or "_(* #,##0.00_)" → NUMBER (monetary)
  - "DD/MM/YYYY" or "MM/DD/YYYY" or "YYYY-MM-DD" or any date pattern → DATE
  - "0" or "#,##0" (no decimals) → INTEGER
  - "General" with numeric content → NUMBER or FLOAT depending on values
  - Text-only columns → VARCHAR
- Named ranges often mark canonical table boundaries — prefer them over heuristic detection
- Multi-level headers: row N-1 is a category group (e.g. "Market Risk"), row N is the field name (e.g. "Delta USD")
- Null sentinels: "N/A", "-", "#N/A" mean the field is NULLABLE
- Totals/subtotal rows (bold, "Total", "Sub-Total", "Grand Total") are NOT data rows
- LOOKUP tables: ≤30 rows, mostly VARCHAR columns, reference/config data
- SUMMARY tables: formula-heavy, aggregations over TRANSACTIONAL data
- CROSSTAB tables: one dimension on rows, one on columns (pivot-like structure)

## Pivot / Crosstab table handling (CRITICAL)
When a sheet has dimensional values as column headers (years, quarters, months, periods, categories that are NOT field names):
1. Classify it as CROSSTAB tableType and set isPivot: true
2. DO NOT create one column per year/quarter/month. Instead create a FLAT schema:
   - One "dimension" column: e.g. YEAR INTEGER (for 2022–2025), PERIOD VARCHAR (for mixed), QUARTER VARCHAR (for Q1/Q2...)
   - If headers are "YYYY Qn" format: create BOTH YEAR INTEGER AND QUARTER VARCHAR
   - Row hierarchy columns: name them SEMANTICALLY based on the data context (not generic LEVEL_1, LEVEL_2)
   - One value column: named after the metric (REVENUE_USD, HEADCOUNT_FTE, CTI_RATIO etc.)
3. In pivotConfig, populate ALL fields: dimensionColumnName, dimensionType, headerRow, hierarchySourceCols (Excel col letters), hierarchyColumnNames (semantic names), valueColumnName, dataStartRow, dataEndRow, pivotStartCol, pivotEndCol, excludePatterns
4. The "columns" array should reflect the FLATTENED schema — not the raw pivot columns

## Row hierarchy naming rules
- Use finance domain knowledge to name hierarchy levels semantically
- "FID", "IED", "BRM" in a financial context → these are business divisions (name the column DIVISION or BU_NAME or BU_LEVEL_5 based on context)
- Sub-rows under a parent → BU_LEVEL_6 or COST_CENTER or SUB_DIVISION
- If in doubt, prefer descriptive names over generic ones

## Output rules
- tableName: UPPER_SNAKE_CASE derived from sheet name and financial context
- dataType: VARCHAR | NUMBER | INTEGER | FLOAT | BOOLEAN | DATE | TIMESTAMP
- confidence 0–1: reflect numFmt evidence weight and data sampling
- evidence: 2–3 concise strings justifying each column's type and confidence
- Include "userModified": false on every column`

function colLetter(n: number): string {
  let result = ''
  while (n > 0) {
    n--
    result = String.fromCharCode(65 + (n % 26)) + result
    n = Math.floor(n / 26)
  }
  return result
}

export function buildSkillsContext(skills: Skill[]): string {
  const enabled = skills.filter((s) => s.enabled)
  if (enabled.length === 0) return ''

  const grouped: Record<string, Skill[]> = {}
  for (const skill of enabled) {
    if (!grouped[skill.category]) grouped[skill.category] = []
    grouped[skill.category].push(skill)
  }

  const lines: string[] = ['## Organisation-specific rules (apply these in all inferences)']
  for (const [category, categorySkills] of Object.entries(grouped)) {
    lines.push(`\n### ${category}`)
    for (const skill of categorySkills) {
      lines.push(`- ${skill.rule}`)
      if (skill.examples && skill.examples.length > 0) {
        lines.push(`  Examples: ${skill.examples.join('; ')}`)
      }
    }
  }

  return lines.join('\n')
}

function buildWorkbookContext(input: WorkbookAnalysis): string {
  const namedRangesStr = input.namedRanges?.length
    ? `\n## Named ranges (canonical table boundaries):\n` +
      input.namedRanges.map((nr) => `  ${nr.name}: ${nr.sheet}!${nr.range}`).join('\n')
    : ''

  const sheetSummaries = input.sheets
    .map((sheet: AnalyzedSheet) => {
      const headerRows = sheet.headerRows?.length
        ? sheet.headerRows
        : sheet.headerRow !== null
          ? [sheet.headerRow]
          : []
      const dataRegion = sheet.primaryDataRegion

      const headers = headerRows.length > 0
        ? headerRows
            .map((hr) => {
              const rowCells = sheet.cells
                .filter((c: CellData) => c.row === hr)
                .sort((a, b) => a.col - b.col)
              return `  Header row ${hr}: ` + rowCells.map((c) => `${colLetter(c.col)}:"${c.value}"`).join(', ')
            })
            .join('\n')
        : '  No header detected'

      const colFormats: Record<string, Record<string, number>> = {}
      if (dataRegion) {
        sheet.cells
          .filter(
            (c: CellData) =>
              c.row >= dataRegion.startRow && c.row <= dataRegion.endRow && c.numFmt,
          )
          .forEach((c: CellData) => {
            const col = colLetter(c.col)
            if (!colFormats[col]) colFormats[col] = {}
            const fmt = c.numFmt!
            colFormats[col][fmt] = (colFormats[col][fmt] ?? 0) + 1
          })
      }
      const numFmtStr = Object.entries(colFormats)
        .map(([col, fmts]) => {
          const [fmt] = Object.entries(fmts).sort((a, b) => b[1] - a[1])[0]
          return `${col}:"${fmt}"`
        })
        .join(', ')

      const sampleRows = dataRegion
        ? sheet.cells
            .filter(
              (c: CellData) =>
                c.row >= dataRegion.startRow &&
                c.row <= Math.min(dataRegion.startRow + 3, dataRegion.endRow),
            )
            .reduce<Record<number, string[]>>((acc, c) => {
              if (!acc[c.row]) acc[c.row] = []
              acc[c.row].push(`${colLetter(c.col)}=${JSON.stringify(c.value)}`)
              return acc
            }, {})
        : {}
      const sampleStr = Object.entries(sampleRows)
        .slice(0, 3)
        .map(([row, vals]) => `  row ${row}: ${vals.join(', ')}`)
        .join('\n')

      const comments = sheet.cells
        .filter((c: CellData) => c.comment)
        .slice(0, 5)
        .map((c: CellData) => `  ${colLetter(c.col)}${c.row}: "${c.comment}"`)
        .join('\n')

      return [
        `Sheet: "${sheet.name}" (${sheet.rowCount} rows × ${sheet.colCount} cols)`,
        `  Data region: ${dataRegion ? `rows ${dataRegion.startRow}–${dataRegion.endRow}, cols ${colLetter(dataRegion.startCol)}–${colLetter(dataRegion.endCol)}` : 'none detected'}`,
        headers,
        numFmtStr ? `  Column numFmts: ${numFmtStr}` : '',
        sampleStr ? `  Sample data:\n${sampleStr}` : '',
        comments ? `  Cell comments:\n${comments}` : '',
      ]
        .filter(Boolean)
        .join('\n')
    })
    .join('\n\n')

  return `Workbook: "${input.fileName}" (${Math.round(input.fileSize / 1024)} KB, ${input.sheets.length} sheets)${namedRangesStr}

## Sheets:
${sheetSummaries}`
}

function buildStage1Prompt(input: WorkbookAnalysis, skills?: Skill[]): string {
  const skillsContext = skills && skills.length > 0 ? buildSkillsContext(skills) : ''
  const skillsSection = skillsContext ? `\n\n${skillsContext}\n` : ''

  return `${buildWorkbookContext(input)}${skillsSection}

## Stage 1 — Table identification
For every sheet that contains tabular data, state:
- Sheet name and inferred table type (TRANSACTIONAL | LOOKUP | SUMMARY | CROSSTAB)
- Header row number(s) (may be multi-level)
- Exact data range in Excel notation (e.g. A5:H250)
- Column letter, header label, and inferred Snowflake dataType — one line per column
- For CROSSTAB/pivot sheets: identify dimension values in headers, hierarchy cols, and the single metric value col

Use numFmt evidence and finance domain knowledge to justify type choices. Be concise.`
}

function buildStage2Prompt(): string {
  return `## Stage 2 — Generate Snowflake schema JSON

Using your analysis above, output the complete schema as valid JSON (no markdown fences, no commentary outside the JSON):
{
  "workbookName": "<filename>",
  "tables": [
    {
      "tableName": "UPPER_SNAKE_CASE",
      "description": "...",
      "sourceSheet": "exact sheet name",
      "sourceRange": "A5:H250",
      "tableType": "TRANSACTIONAL",
      "isPivot": false,
      "confidence": 0.95,
      "columns": [
        {
          "name": "COL_NAME",
          "sourceColumn": "A",
          "sourceRange": "A2:A100",
          "dataType": "VARCHAR",
          "length": 100,
          "nullable": true,
          "confidence": 0.92,
          "evidence": ["reason 1", "reason 2"],
          "userModified": false
        }
      ]
    }
  ]
}

For pivot/crosstab tables, also include:
"isPivot": true,
"pivotConfig": {
  "dimensionColumnName": "YEAR",
  "dimensionType": "INTEGER",
  "headerRow": 3,
  "hierarchySourceCols": ["A", "B"],
  "hierarchyColumnNames": ["DIVISION", "COST_CENTER"],
  "valueColumnName": "REVENUE_USD",
  "dataStartRow": 5,
  "dataEndRow": 120,
  "pivotStartCol": "C",
  "pivotEndCol": "F",
  "excludePatterns": ["Total", "Sub-Total", "Grand Total"]
}`
}

function buildStage3Prompt(existingSkillRules: string[]): string {
  const existing = existingSkillRules.length > 0
    ? `\nExisting rules (do NOT re-suggest these):\n${existingSkillRules.map((r) => `- ${r}`).join('\n')}\n`
    : ''
  return `## Stage 3 — Suggest skills for future inferences
${existing}
Based on the workbook you just analysed, suggest 0–3 reusable rules that would help infer schemas for similar workbooks in the future. Focus on:
- Organisation-specific terminology you encountered (e.g. what "FID" means in this context)
- Structural patterns you detected that aren't in the existing rules
- Data type inference rules specific to this domain

Output as JSON array (empty array if nothing new):
[{ "name": "...", "category": "ORG_CONTEXT|COLUMN_NAMING|DATA_TYPE_RULE|PERIOD_FORMAT|STRUCTURE_RULE", "rule": "...", "examples": [...], "confidence": 0.0, "reason": "..." }]`
}

export class ClaudeSchemaInferenceProvider implements SchemaInferenceProvider {
  async inferSchema(input: WorkbookAnalysis, skills?: Skill[]): Promise<InferSchemaResult> {
    const stage1Prompt = buildStage1Prompt(input, skills)

    const stage1Msg = await client.messages.create({
      model: 'claude-opus-4-7',
      max_tokens: 4096,
      system: FINANCE_SYSTEM_PROMPT,
      thinking: { type: 'adaptive' },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      messages: [{ role: 'user', content: stage1Prompt }] as any,
    })

    const stage2Stream = client.messages.stream({
      model: 'claude-opus-4-7',
      max_tokens: 16000,
      system: FINANCE_SYSTEM_PROMPT,
      thinking: { type: 'adaptive' },
      messages: [
        { role: 'user', content: stage1Prompt },
        { role: 'assistant', content: stage1Msg.content as Parameters<typeof client.messages.create>[0]['messages'][0]['content'] },
        { role: 'user', content: buildStage2Prompt() },
      ],
    })

    const stage2Message = await stage2Stream.finalMessage()

    const textBlock = stage2Message.content.find((b) => b.type === 'text')
    if (!textBlock || textBlock.type !== 'text') {
      throw new Error('Claude returned no text content for schema inference')
    }

    let raw = textBlock.text.trim()
    raw = raw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim()

    const parsed = JSON.parse(raw)
    const schema = WorkbookSchemaZod.parse(parsed) as WorkbookSchema

    // Stage 3 — skill suggestions
    let suggestedSkills: SuggestedSkill[] = []
    try {
      const existingRules = skills ? skills.filter((s) => s.enabled).map((s) => s.rule) : []
      const stage3Prompt = buildStage3Prompt(existingRules)

      const stage3Msg = await client.messages.create({
        model: 'claude-opus-4-7',
        max_tokens: 2048,
        system: FINANCE_SYSTEM_PROMPT,
        messages: [
          { role: 'user', content: stage1Prompt },
          { role: 'assistant', content: stage1Msg.content as Parameters<typeof client.messages.create>[0]['messages'][0]['content'] },
          { role: 'user', content: buildStage2Prompt() },
          { role: 'assistant', content: stage2Message.content as Parameters<typeof client.messages.create>[0]['messages'][0]['content'] },
          { role: 'user', content: stage3Prompt },
        ],
      })

      const stage3Text = stage3Msg.content.find((b) => b.type === 'text')
      if (stage3Text && stage3Text.type === 'text') {
        let stage3Raw = stage3Text.text.trim()
        stage3Raw = stage3Raw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim()
        suggestedSkills = JSON.parse(stage3Raw) as SuggestedSkill[]
      }
    } catch {
      suggestedSkills = []
    }

    return { schema, suggestedSkills }
  }
}
