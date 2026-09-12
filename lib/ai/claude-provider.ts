import Anthropic from '@anthropic-ai/sdk'
import { SchemaInferenceProvider, WorkbookAnalysis } from './provider'
import { WorkbookSchema } from '@/lib/schema/types'
import { WorkbookSchemaZod } from '@/lib/schema/zod-schemas'
import { AnalyzedSheet } from '@/lib/excel/region-detector'
import { CellData } from '@/lib/excel/parser'

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

      // Per-column dominant numFmt within data region
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

      // Sample data rows (up to 3)
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

      // Cell comments (up to 5)
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

function buildStage1Prompt(input: WorkbookAnalysis): string {
  return `${buildWorkbookContext(input)}

## Stage 1 — Table identification
For every sheet that contains tabular data, state:
- Sheet name and inferred table type (TRANSACTIONAL | LOOKUP | SUMMARY | CROSSTAB)
- Header row number(s) (may be multi-level)
- Exact data range in Excel notation (e.g. A5:H250)
- Column letter, header label, and inferred Snowflake dataType — one line per column

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
}`
}

export class ClaudeSchemaInferenceProvider implements SchemaInferenceProvider {
  async inferSchema(input: WorkbookAnalysis): Promise<WorkbookSchema> {
    const stage1Prompt = buildStage1Prompt(input)

    // Stage 1: structure identification (non-streaming, shorter output)
    const stage1Msg = await client.messages.create({
      model: 'claude-opus-4-7',
      max_tokens: 4096,
      system: FINANCE_SYSTEM_PROMPT,
      thinking: { type: 'adaptive' },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      messages: [{ role: 'user', content: stage1Prompt }] as any,
    })

    // Stage 2: full schema JSON, seeding with Stage 1 analysis for context
    const stream = client.messages.stream({
      model: 'claude-opus-4-7',
      max_tokens: 16000,
      system: FINANCE_SYSTEM_PROMPT,
      thinking: { type: 'adaptive' },
      messages: [
        { role: 'user', content: stage1Prompt },
        // Pass all content blocks (including thinking) back so Claude can build on prior reasoning
        { role: 'assistant', content: stage1Msg.content as Parameters<typeof client.messages.create>[0]['messages'][0]['content'] },
        { role: 'user', content: buildStage2Prompt() },
      ],
    })

    const message = await stream.finalMessage()

    const textBlock = message.content.find((b) => b.type === 'text')
    if (!textBlock || textBlock.type !== 'text') {
      throw new Error('Claude returned no text content for schema inference')
    }

    let raw = textBlock.text.trim()
    raw = raw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim()

    const parsed = JSON.parse(raw)
    const result = WorkbookSchemaZod.parse(parsed)
    return result
  }
}
