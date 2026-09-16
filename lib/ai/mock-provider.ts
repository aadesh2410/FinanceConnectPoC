import { SchemaInferenceProvider, WorkbookAnalysis, InferSchemaResult } from './provider'
import { WorkbookSchema } from '@/lib/schema/types'
import { Skill } from '@/lib/skills/types'

export class MockSchemaInferenceProvider implements SchemaInferenceProvider {
  async inferSchema(input: WorkbookAnalysis, _skills?: Skill[]): Promise<InferSchemaResult> {
    await new Promise((r) => setTimeout(r, 800)) // simulate latency

    const tables = input.sheets.slice(0, 4).map((sheet, idx) => {
      return getMockTableForSheet(sheet.name, idx, input.fileName)
    })

    const schema: WorkbookSchema = { workbookName: input.fileName, tables: tables.filter(Boolean) as WorkbookSchema['tables'] }
    return { schema, suggestedSkills: [] }
  }
}

function getMockTableForSheet(sheetName: string, idx: number, _workbookName: string) {
  const name = sheetName.toUpperCase().replace(/\s+/g, '_').replace(/[^A-Z0-9_]/g, '')

  if (idx === 0) {
    return {
      tableName: name || 'TRADE_EXPOSURE',
      description: 'Trade-level exposure data extracted from EUC workbook',
      sourceSheet: sheetName,
      sourceRange: 'A5:H250',
      tableType: 'TRANSACTIONAL' as const,
      confidence: 0.96,
      columns: [
        { name: 'TRADE_ID', sourceColumn: 'A', sourceRange: 'A6:A250', dataType: 'VARCHAR' as const, length: 50, nullable: false, confidence: 0.99, evidence: ['Header indicates trade identifier', 'Values contain alphanumeric identifiers like T001'] },
        { name: 'PRODUCT', sourceColumn: 'B', sourceRange: 'B6:B250', dataType: 'VARCHAR' as const, length: 100, nullable: true, confidence: 0.97, evidence: ['Header contains "Product"', 'Values are short string codes'] },
        { name: 'COUNTERPARTY', sourceColumn: 'C', sourceRange: 'C6:C250', dataType: 'VARCHAR' as const, length: 100, nullable: true, confidence: 0.95, evidence: ['Header contains "Counterparty"', 'Values are bank/entity names'] },
        { name: 'TRADE_DATE', sourceColumn: 'D', sourceRange: 'D6:D250', dataType: 'DATE' as const, nullable: true, confidence: 0.95, evidence: ['Values consistently parse as dates', 'Header contains "Date"', '248/250 populated values match date patterns'] },
        { name: 'CURRENCY', sourceColumn: 'E', sourceRange: 'E6:E250', dataType: 'VARCHAR' as const, length: 3, nullable: true, confidence: 0.98, evidence: ['All values are 3-character ISO currency codes', 'Header contains "Currency"'] },
        { name: 'CURRENT_EXPOSURE', sourceColumn: 'F', sourceRange: 'F6:F250', dataType: 'NUMBER' as const, precision: 18, scale: 2, nullable: true, confidence: 0.92, evidence: ['100% of populated values are numeric', 'Maximum observed decimal scale is 2', 'Header contains "Current Exposure"'] },
        { name: 'POTENTIAL_EXPOSURE', sourceColumn: 'G', sourceRange: 'G6:G250', dataType: 'NUMBER' as const, precision: 18, scale: 2, nullable: true, confidence: 0.91, evidence: ['Numeric values with 2 decimal places', 'Header contains "Potential"'] },
        { name: 'TOTAL_EXPOSURE', sourceColumn: 'H', sourceRange: 'H6:H250', dataType: 'NUMBER' as const, precision: 18, scale: 2, nullable: true, confidence: 0.89, evidence: ['Formula cells: =F+G pattern detected', 'Header contains "Total"', 'Values equal sum of adjacent columns'] },
      ],
    }
  }

  if (idx === 1) {
    return {
      tableName: name || 'COUNTERPARTY',
      description: 'Counterparty reference data',
      sourceSheet: sheetName,
      sourceRange: 'A2:E120',
      tableType: 'LOOKUP' as const,
      confidence: 0.94,
      columns: [
        { name: 'COUNTERPARTY_ID', sourceColumn: 'A', sourceRange: 'A3:A120', dataType: 'VARCHAR' as const, length: 20, nullable: false, confidence: 0.98, evidence: ['Unique identifiers', 'Header indicates primary key'] },
        { name: 'COUNTERPARTY_NAME', sourceColumn: 'B', sourceRange: 'B3:B120', dataType: 'VARCHAR' as const, length: 200, nullable: false, confidence: 0.97, evidence: ['Long string values', 'Header contains "Name"'] },
        { name: 'COUNTRY', sourceColumn: 'C', sourceRange: 'C3:C120', dataType: 'VARCHAR' as const, length: 100, nullable: true, confidence: 0.95, evidence: ['Values are country names', 'Header contains "Country"'] },
        { name: 'RATING', sourceColumn: 'D', sourceRange: 'D3:D120', dataType: 'VARCHAR' as const, length: 10, nullable: true, confidence: 0.88, evidence: ['Values like AAA, AA+, BBB', 'Header contains "Rating"'] },
        { name: 'SECTOR', sourceColumn: 'E', sourceRange: 'E3:E120', dataType: 'VARCHAR' as const, length: 100, nullable: true, confidence: 0.90, evidence: ['Categorical string values', 'Header contains "Sector"'] },
      ],
    }
  }

  if (idx === 2) {
    return {
      tableName: name || 'RWA_SUMMARY',
      description: 'RWA summary by business line — cross-tab layout normalized to row-per-metric',
      sourceSheet: sheetName,
      sourceRange: 'A3:D35',
      tableType: 'SUMMARY' as const,
      confidence: 0.89,
      columns: [
        { name: 'BUSINESS_LINE', sourceColumn: 'A', sourceRange: 'A4:A35', dataType: 'VARCHAR' as const, length: 100, nullable: false, confidence: 0.91, evidence: ['Row labels in cross-tab layout', 'Values are business unit names'] },
        { name: 'METRIC', sourceColumn: 'B', sourceRange: 'B4:B35', dataType: 'VARCHAR' as const, length: 100, nullable: false, confidence: 0.87, evidence: ['Cross-tab column headers normalized to rows', 'Values: Revenue, Expense, RWA'] },
        { name: 'AMOUNT', sourceColumn: 'C', sourceRange: 'C4:C35', dataType: 'NUMBER' as const, precision: 18, scale: 2, nullable: true, confidence: 0.72, evidence: ['Several rows contain "-" instead of numeric values', 'Header ambiguous — could be multiple currencies'], userModified: false },
        { name: 'REPORTING_PERIOD', sourceColumn: 'D', sourceRange: 'D4:D35', dataType: 'VARCHAR' as const, length: 20, nullable: true, confidence: 0.85, evidence: ['Values like Jan-2026, Feb-2026', 'Derived from cross-tab column headers'] },
      ],
    }
  }

  // idx >= 3 — Parameters/lookup sheet
  return {
    tableName: name || 'PARAMETERS',
    description: 'Reference parameters and lookup values',
    sourceSheet: sheetName,
    sourceRange: 'A2:B22',
    tableType: 'LOOKUP' as const,
    confidence: 0.82,
    columns: [
      { name: 'PARAMETER_NAME', sourceColumn: 'A', sourceRange: 'A3:A22', dataType: 'VARCHAR' as const, length: 100, nullable: false, confidence: 0.90, evidence: ['String keys in key-value layout'] },
      { name: 'PARAMETER_VALUE', sourceColumn: 'B', sourceRange: 'B3:B22', dataType: 'VARCHAR' as const, length: 200, nullable: true, confidence: 0.83, evidence: ['Mixed types — stored as VARCHAR for flexibility'] },
    ],
  }
}
