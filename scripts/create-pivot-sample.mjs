import ExcelJS from 'exceljs'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const outPath = path.join(__dirname, '../public/sample_pivot_euc.xlsx')

const wb = new ExcelJS.Workbook()
wb.creator = 'Finance Connect PoC'
wb.created = new Date()

// ─── Styles ──────────────────────────────────────────────────────────────────
const YEARS = [2022, 2023, 2024, 2025]

const headerFill  = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1E3A5F' } }
const l5Fill      = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF2D6A4F' } }
const totalFill   = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFCCE5FF' } }
const grandFill   = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFD6CC' } }
const altFill     = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF5F9F7' } }

const headerFont  = { bold: true, color: { argb: 'FFFFFFFF' }, size: 11, name: 'Calibri' }
const l5Font      = { bold: true, color: { argb: 'FFFFFFFF' }, size: 11, name: 'Calibri' }
const totalFont   = { bold: true, color: { argb: 'FF1E3A5F' }, size: 10, name: 'Calibri' }
const dataFont    = { size: 10, name: 'Calibri' }
const grandFont   = { bold: true, size: 11, name: 'Calibri' }

const border = {
  top:    { style: 'thin', color: { argb: 'FFCCCCCC' } },
  bottom: { style: 'thin', color: { argb: 'FFCCCCCC' } },
  left:   { style: 'thin', color: { argb: 'FFCCCCCC' } },
  right:  { style: 'thin', color: { argb: 'FFCCCCCC' } },
}
const numFmt = '#,##0'

// ─── Sheet 1: Revenue by BU ───────────────────────────────────────────────────
const data = [
  // [BU_LEVEL_5, BU_LEVEL_6, 2022, 2023, 2024, 2025, isTotal, isGrand]
  // FID
  ['FID', null,                         null,    null,    null,    null,    false, false, true],   // L5 header
  ['FID', 'FID Lending',                102400,  115800,  128400,  141600,  false, false, false],
  ['FID', 'FID Securities',              85600,   90200,   96800,  104400,  false, false, false],
  ['FID', 'FID Rates & FX',              61200,   65800,   71200,   79000,  false, false, false],
  ['FID', 'FID Structured Products',     43800,   47600,   52400,   58200,  false, false, false],
  ['FID', 'FID Total',                  293000,  319400,  348800,  383200,  true,  false, false],
  // IED
  ['IED', null,                          null,    null,    null,    null,    false, false, true],   // L5 header
  ['IED', 'IED Corporate Banking',      198400,  218600,  241200,  266000,  false, false, false],
  ['IED', 'IED Institutional Clients',  154000,  168400,  180200,  193400,  false, false, false],
  ['IED', 'IED Transaction Banking',     82000,   89800,   97600,  107400,  false, false, false],
  ['IED', 'IED Trade Finance',           56200,   61400,   68200,   75800,  false, false, false],
  ['IED', 'IED Total',                  490600,  538200,  587200,  642600,  true,  false, false],
  // BRM
  ['BRM', null,                          null,    null,    null,    null,    false, false, true],   // L5 header
  ['BRM', 'BRM Credit Risk',             44800,   48200,   52400,   57200,  false, false, false],
  ['BRM', 'BRM Market Risk',             38200,   41000,   44400,   48600,  false, false, false],
  ['BRM', 'BRM Operational Risk',        24600,   26400,   28800,   31600,  false, false, false],
  ['BRM', 'BRM Compliance',              16400,   17600,   18800,   20400,  false, false, false],
  ['BRM', 'BRM Total',                  124000,  133200,  144400,  157800,  true,  false, false],
  // Grand Total
  [null,  'Grand Total',                907600,  990800, 1080400, 1183600, false, true,  false],
]

function addRevenueSheet(wb) {
  const ws = wb.addWorksheet('Revenue by BU', { views: [{ state: 'frozen', ySplit: 1 }] })

  // Column widths
  ws.getColumn(1).width = 14  // BU Level 5
  ws.getColumn(2).width = 32  // BU Level 6
  ws.getColumn(3).width = 16  // 2022
  ws.getColumn(4).width = 16  // 2023
  ws.getColumn(5).width = 16  // 2024
  ws.getColumn(6).width = 16  // 2025

  // Title row
  ws.mergeCells('A1:F1')
  const titleCell = ws.getCell('A1')
  titleCell.value = 'REVENUE SUMMARY BY BUSINESS UNIT  |  FY 2022–2025  (USD \'000s)'
  titleCell.font = { bold: true, size: 13, color: { argb: 'FF1E3A5F' }, name: 'Calibri' }
  titleCell.alignment = { horizontal: 'center', vertical: 'middle' }
  titleCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE8F4FD' } }
  ws.getRow(1).height = 32

  // Metadata rows
  ws.getCell('A2').value = 'Entity:'
  ws.getCell('B2').value = 'FinCorp Group — Consolidated'
  ws.getCell('A3').value = 'Currency:'
  ws.getCell('B3').value = "USD '000s"
  ws.getCell('A4').value = 'Period:'
  ws.getCell('B4').value = 'FY 2022 – FY 2025 (Actuals 2022-2024, Budget 2025)'
  ws.getCell('A5').value = 'Prepared by:'
  ws.getCell('B5').value = 'FP&A Team'
  ws.getCell('A6').value = 'Last Updated:'
  ws.getCell('B6').value = '15-Sep-2026'
  for (let r = 2; r <= 6; r++) {
    ws.getCell(`A${r}`).font = { bold: true, size: 9, color: { argb: 'FF6B7280' }, name: 'Calibri' }
    ws.getCell(`B${r}`).font = { size: 9, color: { argb: 'FF374151' }, name: 'Calibri' }
  }
  ws.getRow(7).height = 8 // spacer

  // Header row (row 8)
  const hRow = ws.getRow(8)
  hRow.height = 24
  const hValues = ['BU Level 5', 'BU Level 6', ...YEARS]
  hValues.forEach((v, i) => {
    const cell = ws.getCell(8, i + 1)
    cell.value = v
    cell.fill = headerFill
    cell.font = headerFont
    cell.border = border
    cell.alignment = { horizontal: i >= 2 ? 'right' : 'left', vertical: 'middle' }
  })

  let rowNum = 9
  let altToggle = false

  for (const [l5, l6, v22, v23, v24, v25, isTotal, isGrand, isL5Header] of data) {
    const row = ws.getRow(rowNum)
    row.height = 20

    if (isL5Header) {
      // BU Level 5 section header row
      ws.mergeCells(`A${rowNum}:F${rowNum}`)
      const cell = ws.getCell(`A${rowNum}`)
      cell.value = l5
      cell.fill = l5Fill
      cell.font = l5Font
      cell.border = border
      cell.alignment = { horizontal: 'left', vertical: 'middle', indent: 1 }
      rowNum++
      altToggle = false
      continue
    }

    const fill = isGrand ? grandFill : isTotal ? totalFill : altToggle ? altFill : null
    const font = isGrand ? grandFont : isTotal ? totalFont : dataFont

    // Col A: BU Level 5 (only on data rows, blank on total)
    const cellA = ws.getCell(`A${rowNum}`)
    cellA.value = isTotal || isGrand ? '' : l5
    if (fill) cellA.fill = fill
    cellA.font = font
    cellA.border = border
    cellA.alignment = { horizontal: 'left', vertical: 'middle', indent: 1 }

    // Col B: BU Level 6
    const cellB = ws.getCell(`B${rowNum}`)
    cellB.value = l6
    if (fill) cellB.fill = fill
    cellB.font = isTotal ? { ...totalFont, italic: true } : isGrand ? grandFont : { ...dataFont, indent: 1 }
    cellB.border = border
    cellB.alignment = { horizontal: 'left', vertical: 'middle', indent: isTotal || isGrand ? 0 : 2 }

    // Cols C-F: Years
    ;[v22, v23, v24, v25].forEach((val, i) => {
      const cell = ws.getCell(rowNum, i + 3)
      cell.value = val
      cell.numFmt = numFmt
      if (fill) cell.fill = fill
      cell.font = font
      cell.border = border
      cell.alignment = { horizontal: 'right', vertical: 'middle' }
    })

    if (!isTotal && !isGrand) altToggle = !altToggle
    rowNum++
  }

  // Add notes row
  rowNum++
  ws.getCell(`A${rowNum}`).value = 'Notes:'
  ws.getCell(`A${rowNum}`).font = { bold: true, size: 9, color: { argb: 'FF6B7280' }, name: 'Calibri' }
  ws.getCell(`B${rowNum}`).value = 'Values in USD \'000s. 2025 figures are budget. Subtotals may not sum due to rounding.'
  ws.getCell(`B${rowNum}`).font = { size: 9, color: { argb: 'FF9CA3AF' }, italic: true, name: 'Calibri' }
  ws.mergeCells(`B${rowNum}:F${rowNum}`)
}

// ─── Sheet 2: Headcount by BU ─────────────────────────────────────────────────
const headcountData = [
  ['FID', null,                         null, null, null, null, false, false, true],
  ['FID', 'FID Lending',                  84,   92,   98,  105,  false, false, false],
  ['FID', 'FID Securities',               72,   78,   82,   88,  false, false, false],
  ['FID', 'FID Rates & FX',               48,   52,   56,   60,  false, false, false],
  ['FID', 'FID Structured Products',      31,   34,   37,   41,  false, false, false],
  ['FID', 'FID Total',                   235,  256,  273,  294,  true,  false, false],
  ['IED', null,                          null, null, null, null,  false, false, true],
  ['IED', 'IED Corporate Banking',       142,  155,  168,  182,  false, false, false],
  ['IED', 'IED Institutional Clients',   118,  126,  134,  143,  false, false, false],
  ['IED', 'IED Transaction Banking',      64,   70,   76,   83,  false, false, false],
  ['IED', 'IED Trade Finance',            42,   46,   50,   55,  false, false, false],
  ['IED', 'IED Total',                   366,  397,  428,  463,  true,  false, false],
  ['BRM', null,                          null, null, null, null,  false, false, true],
  ['BRM', 'BRM Credit Risk',              38,   41,   44,   48,  false, false, false],
  ['BRM', 'BRM Market Risk',              32,   35,   38,   42,  false, false, false],
  ['BRM', 'BRM Operational Risk',         22,   24,   26,   29,  false, false, false],
  ['BRM', 'BRM Compliance',              18,   19,   21,   23,  false, false, false],
  ['BRM', 'BRM Total',                   110,  119,  129,  142,  true,  false, false],
  [null,  'Grand Total',                 711,  772,  830,  899,  false, true,  false],
]

function addHeadcountSheet(wb) {
  const ws = wb.addWorksheet('Headcount by BU', { views: [{ state: 'frozen', ySplit: 1 }] })

  ws.getColumn(1).width = 14
  ws.getColumn(2).width = 32
  ws.getColumn(3).width = 14
  ws.getColumn(4).width = 14
  ws.getColumn(5).width = 14
  ws.getColumn(6).width = 14

  ws.mergeCells('A1:F1')
  const titleCell = ws.getCell('A1')
  titleCell.value = 'HEADCOUNT SUMMARY BY BUSINESS UNIT  |  FY 2022–2025  (FTE)'
  titleCell.font = { bold: true, size: 13, color: { argb: 'FF1E3A5F' }, name: 'Calibri' }
  titleCell.alignment = { horizontal: 'center', vertical: 'middle' }
  titleCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFEF3C7' } }
  ws.getRow(1).height = 32

  ws.getCell('A2').value = 'Metric:'
  ws.getCell('B2').value = 'Full-Time Equivalents (FTE)'
  ws.getCell('A3').value = 'Scope:'
  ws.getCell('B3').value = 'Permanent staff only, excludes contractors'
  for (let r = 2; r <= 3; r++) {
    ws.getCell(`A${r}`).font = { bold: true, size: 9, color: { argb: 'FF6B7280' }, name: 'Calibri' }
    ws.getCell(`B${r}`).font = { size: 9, color: { argb: 'FF374151' }, name: 'Calibri' }
  }
  ws.getRow(4).height = 8

  const hRow = ws.getRow(5)
  hRow.height = 24
  ;['BU Level 5', 'BU Level 6', ...YEARS].forEach((v, i) => {
    const cell = ws.getCell(5, i + 1)
    cell.value = v
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF78350F' } }
    cell.font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 11, name: 'Calibri' }
    cell.border = border
    cell.alignment = { horizontal: i >= 2 ? 'right' : 'left', vertical: 'middle' }
  })

  let rowNum = 6
  let altToggle = false

  for (const [l5, l6, v22, v23, v24, v25, isTotal, isGrand, isL5Header] of headcountData) {
    const row = ws.getRow(rowNum)
    row.height = 20

    if (isL5Header) {
      ws.mergeCells(`A${rowNum}:F${rowNum}`)
      const cell = ws.getCell(`A${rowNum}`)
      cell.value = l5
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF92400E' } }
      cell.font = l5Font
      cell.border = border
      cell.alignment = { horizontal: 'left', vertical: 'middle', indent: 1 }
      rowNum++
      altToggle = false
      continue
    }

    const fill = isGrand ? grandFill : isTotal ? totalFill : altToggle ? altFill : null
    const font = isGrand ? grandFont : isTotal ? totalFont : dataFont

    const cellA = ws.getCell(`A${rowNum}`)
    cellA.value = isTotal || isGrand ? '' : l5
    if (fill) cellA.fill = fill
    cellA.font = font
    cellA.border = border

    const cellB = ws.getCell(`B${rowNum}`)
    cellB.value = l6
    if (fill) cellB.fill = fill
    cellB.font = isTotal ? { ...totalFont, italic: true } : isGrand ? grandFont : dataFont
    cellB.border = border
    cellB.alignment = { horizontal: 'left', vertical: 'middle', indent: isTotal || isGrand ? 0 : 2 }

    ;[v22, v23, v24, v25].forEach((val, i) => {
      const cell = ws.getCell(rowNum, i + 3)
      cell.value = val
      cell.numFmt = '#,##0'
      if (fill) cell.fill = fill
      cell.font = font
      cell.border = border
      cell.alignment = { horizontal: 'right', vertical: 'middle' }
    })

    if (!isTotal && !isGrand) altToggle = !altToggle
    rowNum++
  }
}

// ─── Sheet 3: Cost-to-Income Ratio (ratio table, different structure) ─────────
function addRatioSheet(wb) {
  const ws = wb.addWorksheet('Cost-to-Income Ratio')

  ws.getColumn(1).width = 14
  ws.getColumn(2).width = 32
  for (let i = 3; i <= 6; i++) ws.getColumn(i).width = 14

  ws.mergeCells('A1:F1')
  const t = ws.getCell('A1')
  t.value = 'COST-TO-INCOME RATIO BY BUSINESS UNIT  |  FY 2022–2025'
  t.font = { bold: true, size: 13, color: { argb: 'FF1E3A5F' }, name: 'Calibri' }
  t.alignment = { horizontal: 'center', vertical: 'middle' }
  t.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF3E8FF' } }
  ws.getRow(1).height = 32

  const hRow = ws.getRow(3)
  hRow.height = 24
  ;['BU Level 5', 'BU Level 6', ...YEARS].forEach((v, i) => {
    const cell = ws.getCell(3, i + 1)
    cell.value = v
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF4C1D95' } }
    cell.font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 11, name: 'Calibri' }
    cell.border = border
    cell.alignment = { horizontal: i >= 2 ? 'right' : 'left', vertical: 'middle' }
  })

  const ratioData = [
    ['FID', null,                         null,  null,  null,  null,  true],
    ['FID', 'FID Lending',                0.421, 0.408, 0.396, 0.384, false],
    ['FID', 'FID Securities',             0.485, 0.471, 0.458, 0.444, false],
    ['FID', 'FID Rates & FX',             0.512, 0.498, 0.482, 0.468, false],
    ['FID', 'FID Structured Products',    0.558, 0.541, 0.525, 0.508, false],
    ['FID', 'FID Average',                0.494, 0.479, 0.465, 0.451, false],
    ['IED', null,                         null,  null,  null,  null,  true],
    ['IED', 'IED Corporate Banking',      0.382, 0.371, 0.358, 0.344, false],
    ['IED', 'IED Institutional Clients',  0.418, 0.404, 0.391, 0.377, false],
    ['IED', 'IED Transaction Banking',    0.445, 0.431, 0.416, 0.401, false],
    ['IED', 'IED Trade Finance',          0.502, 0.488, 0.473, 0.457, false],
    ['IED', 'IED Average',                0.437, 0.423, 0.409, 0.395, false],
    ['BRM', null,                         null,  null,  null,  null,  true],
    ['BRM', 'BRM Credit Risk',            0.721, 0.708, 0.694, 0.679, false],
    ['BRM', 'BRM Market Risk',            0.692, 0.678, 0.663, 0.648, false],
    ['BRM', 'BRM Operational Risk',       0.784, 0.769, 0.753, 0.736, false],
    ['BRM', 'BRM Compliance',             0.812, 0.796, 0.780, 0.762, false],
    ['BRM', 'BRM Average',                0.752, 0.738, 0.723, 0.706, false],
    [null,  'Group Average',              0.561, 0.547, 0.532, 0.517, false],
  ]

  let rowNum = 4
  let altToggle = false
  for (const [l5, l6, v22, v23, v24, v25, isL5Header] of ratioData) {
    const row = ws.getRow(rowNum)
    row.height = 20

    if (isL5Header) {
      ws.mergeCells(`A${rowNum}:F${rowNum}`)
      const cell = ws.getCell(`A${rowNum}`)
      cell.value = l5
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF4C1D95' } }
      cell.font = l5Font
      cell.border = border
      cell.alignment = { horizontal: 'left', vertical: 'middle', indent: 1 }
      rowNum++
      altToggle = false
      continue
    }

    const isAvg = l6?.includes('Average') || l6?.includes('Grand')
    const fill = isAvg ? totalFill : altToggle ? altFill : null

    const cellA = ws.getCell(`A${rowNum}`)
    cellA.value = isAvg ? '' : l5
    if (fill) cellA.fill = fill
    cellA.font = isAvg ? totalFont : dataFont
    cellA.border = border

    const cellB = ws.getCell(`B${rowNum}`)
    cellB.value = l6
    if (fill) cellB.fill = fill
    cellB.font = isAvg ? { ...totalFont, italic: true } : dataFont
    cellB.border = border
    cellB.alignment = { horizontal: 'left', vertical: 'middle', indent: isAvg ? 0 : 2 }

    ;[v22, v23, v24, v25].forEach((val, i) => {
      const cell = ws.getCell(rowNum, i + 3)
      cell.value = val
      cell.numFmt = '0.0%'
      if (fill) cell.fill = fill
      cell.font = isAvg ? totalFont : dataFont
      cell.border = border
      cell.alignment = { horizontal: 'right', vertical: 'middle' }
    })

    if (!isAvg) altToggle = !altToggle
    rowNum++
  }

  const nr = rowNum + 1
  ws.getCell(`A${nr}`).value = 'Note:'
  ws.getCell(`A${nr}`).font = { bold: true, size: 9, color: { argb: 'FF6B7280' } }
  ws.getCell(`B${nr}`).value = 'C/I Ratio = Total Costs / Total Revenue. Lower is better. Target < 45% for FID/IED, < 70% for BRM.'
  ws.getCell(`B${nr}`).font = { size: 9, color: { argb: 'FF9CA3AF' }, italic: true }
  ws.mergeCells(`B${nr}:F${nr}`)
}

addRevenueSheet(wb)
addHeadcountSheet(wb)
addRatioSheet(wb)

await wb.xlsx.writeFile(outPath)
console.log('Created:', outPath)
