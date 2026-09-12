import ExcelJS from 'exceljs'

export interface CellData {
  row: number
  col: number
  value: string | number | boolean | null
  formula?: string
  type: 'string' | 'number' | 'boolean' | 'date' | 'formula' | 'empty'
  isDate?: boolean
}

export interface MergedCellInfo {
  top: number
  left: number
  bottom: number
  right: number
}

export interface SheetData {
  name: string
  rowCount: number
  colCount: number
  cells: CellData[]
  mergedCells: MergedCellInfo[]
}

export interface WorkbookData {
  fileName: string
  fileSize: number
  sheets: SheetData[]
}

export async function parseWorkbook(buffer: Buffer, fileName: string): Promise<WorkbookData> {
  const workbook = new ExcelJS.Workbook()
  await workbook.xlsx.load(buffer as unknown as Parameters<typeof workbook.xlsx.load>[0])

  const sheets: SheetData[] = []

  workbook.eachSheet((worksheet) => {
    const cells: CellData[] = []
    const mergedCells: MergedCellInfo[] = []

    // Collect merged cell info
    // @ts-expect-error ExcelJS internal
    const merges: Record<string, ExcelJS.Range> = worksheet._merges ?? {}
    for (const key of Object.keys(merges)) {
      const range = merges[key]
      if (range && typeof range === 'object' && 'top' in range) {
        mergedCells.push({
          top: range.top as number,
          left: range.left as number,
          bottom: range.bottom as number,
          right: range.right as number,
        })
      }
    }

    worksheet.eachRow({ includeEmpty: false }, (row, rowNumber) => {
      row.eachCell({ includeEmpty: false }, (cell, colNumber) => {
        let value: string | number | boolean | null = null
        let type: CellData['type'] = 'empty'
        let isDate = false
        let formula: string | undefined

        if (cell.formula) {
          formula = cell.formula
          type = 'formula'
          const rv = cell.result
          if (rv instanceof Date) {
            value = rv.toISOString().split('T')[0]
            isDate = true
          } else if (rv !== null && rv !== undefined) {
            value = rv as string | number | boolean
          }
        } else if (cell.value instanceof Date) {
          value = cell.value.toISOString().split('T')[0]
          type = 'date'
          isDate = true
        } else if (typeof cell.value === 'object' && cell.value !== null && 'richText' in cell.value) {
          value = (cell.value as ExcelJS.CellRichTextValue).richText.map((r) => r.text).join('')
          type = 'string'
        } else if (typeof cell.value === 'object' && cell.value !== null && 'sharedString' in cell.value) {
          value = String(cell.value)
          type = 'string'
        } else {
          value = cell.value as string | number | boolean | null
          if (typeof value === 'number') type = 'number'
          else if (typeof value === 'boolean') type = 'boolean'
          else if (typeof value === 'string') type = 'string'
          else type = 'empty'
        }

        if (value !== null && value !== undefined) {
          cells.push({ row: rowNumber, col: colNumber, value, formula, type, isDate })
        }
      })
    })

    sheets.push({
      name: worksheet.name,
      rowCount: worksheet.rowCount,
      colCount: worksheet.columnCount,
      cells,
      mergedCells,
    })
  })

  return {
    fileName,
    fileSize: buffer.length,
    sheets,
  }
}
