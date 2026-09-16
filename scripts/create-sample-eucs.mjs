import ExcelJS from 'exceljs'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const outDir = path.join(__dirname, '../public')

// ─── Shared styling ──────────────────────────────────────────────────────────
const border = {
  top:    { style: 'thin', color: { argb: 'FFCCCCCC' } },
  bottom: { style: 'thin', color: { argb: 'FFCCCCCC' } },
  left:   { style: 'thin', color: { argb: 'FFCCCCCC' } },
  right:  { style: 'thin', color: { argb: 'FFCCCCCC' } },
}
const thickBorder = {
  top:    { style: 'medium', color: { argb: 'FF1E3A5F' } },
  bottom: { style: 'medium', color: { argb: 'FF1E3A5F' } },
  left:   { style: 'medium', color: { argb: 'FF1E3A5F' } },
  right:  { style: 'medium', color: { argb: 'FF1E3A5F' } },
}
const HDR_FILL     = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1E3A5F' } }
const HDR_FONT     = { bold: true, color: { argb: 'FFFFFFFF' }, size: 11, name: 'Calibri' }
const SECTION_FILL = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF2D6A4F' } }
const SECTION_FONT = { bold: true, color: { argb: 'FFFFFFFF' }, size: 11, name: 'Calibri' }
const TOTAL_FILL   = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFCCE5FF' } }
const TOTAL_FONT   = { bold: true, color: { argb: 'FF1E3A5F' }, size: 10, name: 'Calibri' }
const GRAND_FILL   = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFD6CC' } }
const GRAND_FONT   = { bold: true, size: 11, name: 'Calibri' }
const TITLE_FONT   = { bold: true, size: 14, color: { argb: 'FF1E3A5F' }, name: 'Calibri' }
const NOTE_FONT    = { italic: true, size: 10, color: { argb: 'FF666666' }, name: 'Calibri' }

function styleHeaderRow(ws, rowNum, startCol, endCol) {
  for (let c = startCol; c <= endCol; c++) {
    const cell = ws.getCell(rowNum, c)
    cell.fill = HDR_FILL; cell.font = HDR_FONT; cell.border = border
    cell.alignment = { horizontal: 'center', vertical: 'middle' }
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// FILE 1: FX Trade Blotter — metadata + flat trade data + exposure summary
// ═══════════════════════════════════════════════════════════════════════════
async function fileTrade() {
  const wb = new ExcelJS.Workbook()
  wb.creator = 'Finance Connect PoC'
  wb.created = new Date()

  // ── Sheet 1: Cover ─────────────────────────────────────────────────────────
  const s1 = wb.addWorksheet('Cover')
  s1.getColumn(1).width = 28
  s1.getColumn(2).width = 60
  s1.getCell('A1').value = 'FX Trade Blotter — Daily Report'
  s1.getCell('A1').font = TITLE_FONT
  s1.mergeCells('A1:B1')
  const meta = [
    ['Report Date',      '2026-09-15'],
    ['Business Date',    '2026-09-14'],
    ['Prepared By',      'Sarah Chen, FX Trading Ops'],
    ['Legal Entity',     'MSCO (Morgan Stanley & Co LLC)'],
    ['Desk',             'G10 FX Spot & Forwards'],
    ['Currency',         'USD equivalent, notionals in USD millions'],
    ['Version',          'v2.4'],
    ['Notes',            'Excludes NDF trades booked in EM desk. All MTMs at 5pm NYC snap.'],
    ['Contact',          'fx-ops-london@msco-example.com'],
  ]
  meta.forEach(([k, v], i) => {
    const r = 3 + i
    s1.getCell(`A${r}`).value = k
    s1.getCell(`A${r}`).font = { bold: true, size: 10 }
    s1.getCell(`B${r}`).value = v
    s1.getCell(`B${r}`).font = { size: 10 }
  })

  // ── Sheet 2: FX Trades ─────────────────────────────────────────────────────
  const s2 = wb.addWorksheet('FX Trades')
  const cols = ['Trade ID', 'Trade Date', 'Settlement Date', 'Counterparty', 'LEI', 'Instrument', 'Currency Pair', 'Buy/Sell', 'Notional USD (m)', 'Rate', 'MTM USD (k)', 'PnL USD (k)', 'Status']
  cols.forEach((h, i) => { s2.getCell(1, i + 1).value = h })
  styleHeaderRow(s2, 1, 1, cols.length)
  const widths = [14, 12, 14, 26, 24, 14, 14, 10, 15, 10, 13, 13, 12]
  widths.forEach((w, i) => { s2.getColumn(i + 1).width = w })

  const cptys = [
    ['DeutscheBank AG',   '7LTWFZYICNSX8D621K86'],
    ['HSBC Bank plc',     'MP6I5ZYZBEU3UXPYFY54'],
    ['Barclays Bank plc', 'G5GSEF7VJP5I7OUK5573'],
    ['BNP Paribas',       'R0MUWSFPU8MPRO8K5P83'],
    ['Citibank NA',       'E57ODZWZ7FF32TWEFA76'],
    ['UBS AG',            'BFM8T61CT2L1QCEMIK50'],
  ]
  const pairs = ['EUR/USD', 'GBP/USD', 'USD/JPY', 'USD/CHF', 'AUD/USD', 'USD/CAD']
  const instruments = ['FX Spot', 'FX Forward', 'FX Swap', 'FX NDF']
  const trades = []
  for (let i = 0; i < 42; i++) {
    const cp = cptys[i % cptys.length]
    const pair = pairs[i % pairs.length]
    const inst = instruments[i % instruments.length]
    const notional = Math.round((Math.random() * 480 + 20) * 10) / 10
    const rate = pair === 'USD/JPY' ? 145 + Math.random() * 6 : 0.9 + Math.random() * 0.6
    const mtm = Math.round((Math.random() - 0.5) * 320)
    const pnl = Math.round((Math.random() - 0.4) * 180)
    const td = new Date(2026, 8, 14 - (i % 5))
    const sd = new Date(td); sd.setDate(sd.getDate() + (inst === 'FX Spot' ? 2 : (30 + (i % 60))))
    trades.push([
      `FX-${String(240000 + i).padStart(6, '0')}`,
      td, sd, cp[0], cp[1], inst, pair,
      i % 2 === 0 ? 'Buy' : 'Sell',
      notional,
      Math.round(rate * 10000) / 10000,
      mtm, pnl,
      i % 15 === 0 ? 'Pending' : 'Confirmed',
    ])
  }
  trades.forEach((row, i) => {
    const rowNum = i + 2
    row.forEach((v, ci) => { s2.getCell(rowNum, ci + 1).value = v })
    s2.getCell(rowNum, 2).numFmt = 'dd/mm/yyyy'
    s2.getCell(rowNum, 3).numFmt = 'dd/mm/yyyy'
    s2.getCell(rowNum, 9).numFmt = '#,##0.0'
    s2.getCell(rowNum, 10).numFmt = '#,##0.0000'
    s2.getCell(rowNum, 11).numFmt = '#,##0'
    s2.getCell(rowNum, 12).numFmt = '#,##0;[Red]-#,##0'
    for (let c = 1; c <= cols.length; c++) s2.getCell(rowNum, c).border = border
  })
  s2.views = [{ state: 'frozen', ySplit: 1 }]

  // ── Sheet 3: Exposure Summary (pivot) ──────────────────────────────────────
  const s3 = wb.addWorksheet('Exposure Summary')
  s3.getCell('A1').value = 'Notional Exposure by Currency Pair & Instrument (USD millions)'
  s3.getCell('A1').font = TITLE_FONT
  s3.mergeCells('A1:F1')
  s3.getCell('A2').value = 'As at 2026-09-14 close'
  s3.getCell('A2').font = NOTE_FONT

  // pivot: rows = pair, cols = instrument, value = notional
  const headers = ['Currency Pair', 'FX Spot', 'FX Forward', 'FX Swap', 'FX NDF', 'Total']
  headers.forEach((h, i) => { s3.getCell(4, i + 1).value = h })
  styleHeaderRow(s3, 4, 1, headers.length)
  s3.getColumn(1).width = 18
  for (let i = 2; i <= 6; i++) s3.getColumn(i).width = 14

  const summary = {}
  for (const t of trades) {
    const pair = t[6], inst = t[5], notional = t[8]
    summary[pair] = summary[pair] || {}
    summary[pair][inst] = (summary[pair][inst] || 0) + notional
  }
  let r = 5
  const grandRow = { 'FX Spot': 0, 'FX Forward': 0, 'FX Swap': 0, 'FX NDF': 0 }
  for (const pair of pairs) {
    const row = summary[pair] || {}
    let rowTotal = 0
    s3.getCell(r, 1).value = pair
    instruments.forEach((inst, i) => {
      const v = row[inst] || 0
      s3.getCell(r, i + 2).value = Math.round(v * 10) / 10
      s3.getCell(r, i + 2).numFmt = '#,##0.0'
      rowTotal += v
      grandRow[inst] += v
    })
    s3.getCell(r, 6).value = Math.round(rowTotal * 10) / 10
    s3.getCell(r, 6).numFmt = '#,##0.0'
    s3.getCell(r, 6).font = { bold: true }
    for (let c = 1; c <= 6; c++) s3.getCell(r, c).border = border
    r++
  }
  // Grand total
  s3.getCell(r, 1).value = 'Grand Total'
  instruments.forEach((inst, i) => {
    s3.getCell(r, i + 2).value = Math.round(grandRow[inst] * 10) / 10
    s3.getCell(r, i + 2).numFmt = '#,##0.0'
  })
  const gt = Object.values(grandRow).reduce((a, b) => a + b, 0)
  s3.getCell(r, 6).value = Math.round(gt * 10) / 10
  s3.getCell(r, 6).numFmt = '#,##0.0'
  for (let c = 1; c <= 6; c++) {
    s3.getCell(r, c).fill = GRAND_FILL
    s3.getCell(r, c).font = GRAND_FONT
    s3.getCell(r, c).border = border
  }

  const out = path.join(outDir, 'sample_fx_trade_blotter.xlsx')
  await wb.xlsx.writeFile(out)
  console.log('  ✓', out)
}

// ═══════════════════════════════════════════════════════════════════════════
// FILE 2: Credit Concentration — multiple pivots on ONE sheet + description
// ═══════════════════════════════════════════════════════════════════════════
async function fileCreditConcentration() {
  const wb = new ExcelJS.Workbook()
  wb.creator = 'Finance Connect PoC'
  wb.created = new Date()

  // ── Sheet 1: Description ───────────────────────────────────────────────────
  const s1 = wb.addWorksheet('Description')
  s1.getColumn(1).width = 22
  s1.getColumn(2).width = 90
  s1.getCell('A1').value = 'Credit Risk Concentration Report'
  s1.getCell('A1').font = TITLE_FONT
  s1.mergeCells('A1:B1')
  const desc = [
    ['Purpose',       'Weekly concentration monitoring for corporate credit portfolio — three views: sector, country of risk, internal rating.'],
    ['Owner',         'Credit Risk Analytics — London / New York'],
    ['Frequency',     'Weekly (Monday 09:00 GMT)'],
    ['Report Date',   '2026-09-15'],
    ['Portfolio',     'MSCO Corporate Lending Book (excludes SPV and structured exposures)'],
    ['Units',         'All exposure figures in USD millions unless noted. Ratios expressed as %.'],
    ['Rating Scale',  'Internal 1-10 (1 = highest quality). External ratings shown per S&P scale.'],
    ['Limits',        'Sector limits per Credit Policy CP-2024-014. Country limits per CP-2024-021.'],
    ['Escalation',    'Any concentration >90% of limit → email Head of Credit and portfolio manager.'],
    ['Data Source',   'Risk Warehouse feed C-EXP-DAILY, snapshot as of prior day close.'],
    ['Notes',         'Utilisation % = Current Exposure / Limit. Headroom = Limit - Current Exposure.'],
  ]
  desc.forEach(([k, v], i) => {
    const r = 3 + i
    s1.getCell(`A${r}`).value = k; s1.getCell(`A${r}`).font = { bold: true, size: 10 }
    s1.getCell(`B${r}`).value = v; s1.getCell(`B${r}`).font = { size: 10 }
    s1.getRow(r).height = 24
    s1.getCell(`B${r}`).alignment = { wrapText: true, vertical: 'top' }
  })

  // ── Sheet 2: Concentration Views (3 pivots stacked) ────────────────────────
  const s2 = wb.addWorksheet('Concentration Views')
  s2.getColumn(1).width = 28
  for (let i = 2; i <= 7; i++) s2.getColumn(i).width = 14
  s2.getCell('A1').value = 'Corporate Credit Concentration — Multi-View'
  s2.getCell('A1').font = TITLE_FONT
  s2.mergeCells('A1:G1')
  s2.getCell('A2').value = 'As at 2026-09-14 | USD millions | Utilisation shown as %'
  s2.getCell('A2').font = NOTE_FONT

  // View 1: By Sector — pivot with metric columns
  s2.getCell('A4').value = 'View 1 — Exposure by Sector'
  s2.getCell('A4').font = { bold: true, size: 12, color: { argb: 'FF1E3A5F' } }
  const v1Head = ['Sector', 'Current Exp USD (m)', 'Limit USD (m)', 'Utilisation %', 'Headroom USD (m)', '# Counterparties']
  v1Head.forEach((h, i) => { s2.getCell(5, i + 1).value = h })
  styleHeaderRow(s2, 5, 1, v1Head.length)
  const sectors = [
    ['Financials',           4820,  6000, 42],
    ['Energy',               3210,  4500, 28],
    ['Industrials',          2680,  3500, 34],
    ['Consumer Discretionary', 2140, 3000, 26],
    ['Technology',           1980,  3000, 22],
    ['Healthcare',           1560,  2500, 19],
    ['Utilities',            1420,  2000, 15],
    ['Materials',            1180,  2000, 14],
    ['Real Estate',           940,  1500, 11],
    ['Telecom',               620,  1000,  8],
  ]
  sectors.forEach((row, i) => {
    const r = 6 + i
    const [name, curr, limit, cpty] = row
    s2.getCell(r, 1).value = name
    s2.getCell(r, 2).value = curr; s2.getCell(r, 2).numFmt = '#,##0'
    s2.getCell(r, 3).value = limit; s2.getCell(r, 3).numFmt = '#,##0'
    s2.getCell(r, 4).value = curr / limit; s2.getCell(r, 4).numFmt = '0.0%'
    s2.getCell(r, 5).value = limit - curr; s2.getCell(r, 5).numFmt = '#,##0'
    s2.getCell(r, 6).value = cpty
    for (let c = 1; c <= 6; c++) s2.getCell(r, c).border = border
  })
  // Total for View 1
  const v1TotalRow = 6 + sectors.length
  s2.getCell(v1TotalRow, 1).value = 'Total — All Sectors'
  const totalCurr = sectors.reduce((a, r) => a + r[1], 0)
  const totalLim  = sectors.reduce((a, r) => a + r[2], 0)
  const totalCpty = sectors.reduce((a, r) => a + r[3], 0)
  s2.getCell(v1TotalRow, 2).value = totalCurr; s2.getCell(v1TotalRow, 2).numFmt = '#,##0'
  s2.getCell(v1TotalRow, 3).value = totalLim; s2.getCell(v1TotalRow, 3).numFmt = '#,##0'
  s2.getCell(v1TotalRow, 4).value = totalCurr / totalLim; s2.getCell(v1TotalRow, 4).numFmt = '0.0%'
  s2.getCell(v1TotalRow, 5).value = totalLim - totalCurr; s2.getCell(v1TotalRow, 5).numFmt = '#,##0'
  s2.getCell(v1TotalRow, 6).value = totalCpty
  for (let c = 1; c <= 6; c++) {
    s2.getCell(v1TotalRow, c).fill = GRAND_FILL
    s2.getCell(v1TotalRow, c).font = GRAND_FONT
    s2.getCell(v1TotalRow, c).border = border
  }

  // View 2: By Country of Risk — starts a few rows below
  const v2Start = v1TotalRow + 3
  s2.getCell(`A${v2Start}`).value = 'View 2 — Exposure by Country of Risk'
  s2.getCell(`A${v2Start}`).font = { bold: true, size: 12, color: { argb: 'FF1E3A5F' } }
  const v2Head = ['Country', 'Region', 'Current Exp USD (m)', 'Limit USD (m)', 'Utilisation %', 'Headroom USD (m)']
  v2Head.forEach((h, i) => { s2.getCell(v2Start + 1, i + 1).value = h })
  styleHeaderRow(s2, v2Start + 1, 1, v2Head.length)
  const countries = [
    ['United States',   'NAMR',  6480, 8000],
    ['United Kingdom',  'EMEA',  2140, 3000],
    ['Germany',         'EMEA',  1820, 2500],
    ['France',          'EMEA',  1560, 2000],
    ['Japan',           'APAC',  1420, 2000],
    ['China',           'APAC',  1180, 1500],
    ['Canada',          'NAMR',   940, 1500],
    ['Singapore',       'APAC',   680, 1000],
    ['Brazil',          'LATAM',  420,  800],
    ['Mexico',          'LATAM',  310,  600],
  ]
  countries.forEach((row, i) => {
    const r = v2Start + 2 + i
    const [c, reg, curr, limit] = row
    s2.getCell(r, 1).value = c
    s2.getCell(r, 2).value = reg
    s2.getCell(r, 3).value = curr; s2.getCell(r, 3).numFmt = '#,##0'
    s2.getCell(r, 4).value = limit; s2.getCell(r, 4).numFmt = '#,##0'
    s2.getCell(r, 5).value = curr / limit; s2.getCell(r, 5).numFmt = '0.0%'
    s2.getCell(r, 6).value = limit - curr; s2.getCell(r, 6).numFmt = '#,##0'
    for (let c2 = 1; c2 <= 6; c2++) s2.getCell(r, c2).border = border
  })

  // View 3: By Internal Rating — starts a few rows below View 2
  const v3Start = v2Start + 2 + countries.length + 2
  s2.getCell(`A${v3Start}`).value = 'View 3 — Exposure by Internal Rating Bucket'
  s2.getCell(`A${v3Start}`).font = { bold: true, size: 12, color: { argb: 'FF1E3A5F' } }
  const v3Head = ['Internal Rating', 'S&P Equivalent', 'Current Exp USD (m)', '# Counterparties', 'Avg PD %', 'Avg LGD %']
  v3Head.forEach((h, i) => { s2.getCell(v3Start + 1, i + 1).value = h })
  styleHeaderRow(s2, v3Start + 1, 1, v3Head.length)
  const ratings = [
    ['1',  'AAA/AA+', 1240, 12, 0.0002, 0.35],
    ['2',  'AA/AA-',  2180, 18, 0.0008, 0.38],
    ['3',  'A+/A',    3420, 32, 0.0022, 0.40],
    ['4',  'A-/BBB+', 4180, 41, 0.0058, 0.42],
    ['5',  'BBB',     3860, 38, 0.0124, 0.44],
    ['6',  'BBB-/BB+',2140, 28, 0.0284, 0.46],
    ['7',  'BB',      1420, 22, 0.0612, 0.48],
    ['8',  'BB-/B+',   680, 14, 0.1240, 0.52],
    ['9',  'B/B-',     320,  8, 0.2480, 0.55],
    ['10', 'CCC/D',    120,  4, 0.5620, 0.62],
  ]
  ratings.forEach((row, i) => {
    const r = v3Start + 2 + i
    row.forEach((v, ci) => {
      s2.getCell(r, ci + 1).value = v
      s2.getCell(r, ci + 1).border = border
    })
    s2.getCell(r, 3).numFmt = '#,##0'
    s2.getCell(r, 5).numFmt = '0.0000%'
    s2.getCell(r, 6).numFmt = '0.00%'
  })

  // ── Sheet 3: Exposure Detail (flat) ────────────────────────────────────────
  const s3 = wb.addWorksheet('Exposure Detail')
  const detailCols = ['Counterparty ID', 'Counterparty Name', 'LEI', 'Sector', 'Country', 'Region', 'Internal Rating', 'S&P Rating', 'Current Exp USD (m)', 'Limit USD (m)', 'PD %', 'LGD %']
  detailCols.forEach((h, i) => { s3.getCell(1, i + 1).value = h })
  styleHeaderRow(s3, 1, 1, detailCols.length)
  ;[16, 30, 24, 18, 16, 10, 12, 14, 16, 14, 10, 10].forEach((w, i) => { s3.getColumn(i + 1).width = w })
  const cptyList = [
    ['CP-000821', 'Apex Industrial Corp',   '5493003ABCD1234EF56', 'Industrials',           'United States', 'NAMR', 4, 'BBB+',  240, 400, 0.0068, 0.42],
    ['CP-000934', 'BlueRiver Energy Ltd',   '5493004GHIJ5678KL90', 'Energy',                'United Kingdom','EMEA', 5, 'BBB',   180, 250, 0.0110, 0.44],
    ['CP-001045', 'Meridian Tech Holdings', '5493005MNOP9012QR34', 'Technology',            'United States', 'NAMR', 3, 'A',     320, 500, 0.0024, 0.40],
    ['CP-001102', 'Nordic Utilities AB',    '5493006STUV3456WX78', 'Utilities',             'Germany',       'EMEA', 3, 'A-',    140, 200, 0.0028, 0.40],
    ['CP-001167', 'Sanjo Chemicals KK',     '5493007YZAB9012CD34', 'Materials',             'Japan',         'APAC', 4, 'BBB',   210, 350, 0.0072, 0.42],
    ['CP-001210', 'Longbow Retail plc',     '5493008EFGH5678IJ90', 'Consumer Discretionary','United Kingdom','EMEA', 6, 'BB+',   160, 250, 0.0298, 0.46],
    ['CP-001284', 'Pacifica Health Group',  '5493009KLMN1234OP56', 'Healthcare',            'Canada',        'NAMR', 4, 'BBB',   190, 300, 0.0058, 0.42],
    ['CP-001321', 'Zephyr Real Estate REIT','5493010QRST7890UV12', 'Real Estate',           'Singapore',     'APAC', 5, 'BBB-',  140, 200, 0.0128, 0.44],
    ['CP-001389', 'Andes Mining SA',        '5493011WXYZ3456AB78', 'Materials',             'Brazil',        'LATAM',7, 'BB-',    80, 150, 0.0680, 0.50],
    ['CP-001402', 'Global Telecoms plc',    '5493012CDEF9012GH34', 'Telecom',               'France',        'EMEA', 4, 'BBB+',  150, 250, 0.0058, 0.42],
  ]
  cptyList.forEach((row, i) => {
    const r = i + 2
    row.forEach((v, ci) => { s3.getCell(r, ci + 1).value = v })
    s3.getCell(r, 9).numFmt = '#,##0'
    s3.getCell(r, 10).numFmt = '#,##0'
    s3.getCell(r, 11).numFmt = '0.0000%'
    s3.getCell(r, 12).numFmt = '0.00%'
    for (let c = 1; c <= detailCols.length; c++) s3.getCell(r, c).border = border
  })
  s3.views = [{ state: 'frozen', ySplit: 1 }]

  const out = path.join(outDir, 'sample_credit_concentration.xlsx')
  await wb.xlsx.writeFile(out)
  console.log('  ✓', out)
}

// ═══════════════════════════════════════════════════════════════════════════
// FILE 3: P&L Attribution — SCENARIO pivot (Actual / Budget / Forecast / Var)
// ═══════════════════════════════════════════════════════════════════════════
async function filePnLAttribution() {
  const wb = new ExcelJS.Workbook()
  wb.creator = 'Finance Connect PoC'
  wb.created = new Date()

  // ── Sheet 1: Notes ─────────────────────────────────────────────────────────
  const s1 = wb.addWorksheet('Notes')
  s1.getColumn(1).width = 24
  s1.getColumn(2).width = 88
  s1.getCell('A1').value = 'ISG P&L Attribution — Q3 FY26'
  s1.getCell('A1').font = TITLE_FONT
  s1.mergeCells('A1:B1')
  const notes = [
    ['Reporting Period',  'Q3 FY26 (Jul-Sep 2026)'],
    ['Legal Entity',      'MSCO (Morgan Stanley & Co LLC)'],
    ['Segment',           'Institutional Securities Group (ISG)'],
    ['Currency',          'All figures in USD millions'],
    ['Scenarios',         'Actual = booked P&L | Budget = FY26 plan | Forecast = latest reforecast | Variance = Actual - Budget | Prior Year = Q3 FY25 actual'],
    ['Preparer',          'ISG Finance Business Partners'],
    ['Reviewer',          'CFO ISG'],
    ['Notes',             'Fee income excludes prime brokerage rebates (booked separately). Compensation includes discretionary accrual at 42% comp/rev ratio.'],
  ]
  notes.forEach(([k, v], i) => {
    const r = 3 + i
    s1.getCell(`A${r}`).value = k; s1.getCell(`A${r}`).font = { bold: true, size: 10 }
    s1.getCell(`B${r}`).value = v; s1.getCell(`B${r}`).font = { size: 10 }
    s1.getCell(`B${r}`).alignment = { wrapText: true, vertical: 'top' }
    s1.getRow(r).height = 22
  })

  // ── Sheet 2: P&L by Desk (SCENARIO pivot) ──────────────────────────────────
  const s2 = wb.addWorksheet('PnL by Desk')
  s2.getCell('A1').value = 'Q3 FY26 P&L by Desk — Scenario View (USD millions)'
  s2.getCell('A1').font = TITLE_FONT
  s2.mergeCells('A1:G1')

  const scenarios = ['Actual', 'Budget', 'Forecast', 'Prior Year', 'Variance vs Budget']
  const header = ['Division', 'Desk', ...scenarios]
  header.forEach((h, i) => { s2.getCell(3, i + 1).value = h })
  styleHeaderRow(s2, 3, 1, header.length)
  s2.getColumn(1).width = 22; s2.getColumn(2).width = 32
  for (let i = 3; i <= 7; i++) s2.getColumn(i).width = 14

  // Data: [Division, Desk, Actual, Budget, Forecast, PriorYear]
  const pnl = [
    ['Equities', null, null, null, null, null], // section header
    ['Equities', 'Cash Equities Trading',        342.6, 320.0, 335.0, 298.4],
    ['Equities', 'Equity Derivatives',           218.4, 210.0, 220.0, 195.2],
    ['Equities', 'Prime Brokerage',              412.8, 380.0, 400.0, 362.0],
    ['Equities', 'Electronic Trading',            84.2,  80.0,  85.0,  72.6],
    ['Equities', 'Equities Total',              1058.0, 990.0,1040.0, 928.2],
    ['Fixed Income', null, null, null, null, null],
    ['Fixed Income', 'Rates Trading',            286.4, 300.0, 290.0, 272.8],
    ['Fixed Income', 'Credit Trading',           198.6, 200.0, 205.0, 184.4],
    ['Fixed Income', 'FX Trading',               164.2, 160.0, 168.0, 148.6],
    ['Fixed Income', 'Emerging Markets',          82.4,  90.0,  85.0,  76.2],
    ['Fixed Income', 'Commodities',              108.6, 105.0, 110.0,  94.8],
    ['Fixed Income', 'Fixed Income Total',       840.2, 855.0, 858.0, 776.8],
    ['Investment Banking', null, null, null, null, null],
    ['Investment Banking', 'M&A Advisory',       462.0, 480.0, 475.0, 428.4],
    ['Investment Banking', 'ECM',                284.6, 320.0, 300.0, 342.8],
    ['Investment Banking', 'DCM',                198.4, 220.0, 210.0, 232.6],
    ['Investment Banking', 'Leveraged Finance',   96.2, 110.0, 105.0, 118.4],
    ['Investment Banking', 'IB Total',          1041.2,1130.0,1090.0,1122.2],
  ]
  let r = 4
  for (const row of pnl) {
    const [div, desk, actual, budget, forecast, py] = row
    const isSection = desk === null
    const isTotal = desk && /Total$/.test(desk)
    if (isSection) {
      s2.getCell(r, 1).value = div
      for (let c = 1; c <= 7; c++) {
        s2.getCell(r, c).fill = SECTION_FILL
        s2.getCell(r, c).font = SECTION_FONT
        s2.getCell(r, c).border = border
      }
    } else {
      s2.getCell(r, 1).value = div
      s2.getCell(r, 2).value = desk
      s2.getCell(r, 3).value = actual
      s2.getCell(r, 4).value = budget
      s2.getCell(r, 5).value = forecast
      s2.getCell(r, 6).value = py
      s2.getCell(r, 7).value = Math.round((actual - budget) * 10) / 10
      for (let c = 3; c <= 7; c++) s2.getCell(r, c).numFmt = '#,##0.0;[Red]-#,##0.0'
      for (let c = 1; c <= 7; c++) s2.getCell(r, c).border = border
      if (isTotal) {
        for (let c = 1; c <= 7; c++) {
          s2.getCell(r, c).fill = TOTAL_FILL
          s2.getCell(r, c).font = TOTAL_FONT
        }
      }
    }
    r++
  }
  // Grand total
  s2.getCell(r, 1).value = 'ISG Grand Total'
  const gr = { a: 0, b: 0, f: 0, p: 0 }
  for (const row of pnl) {
    if (row[1] && /Total$/.test(row[1])) {
      gr.a += row[2]; gr.b += row[3]; gr.f += row[4]; gr.p += row[5]
    }
  }
  s2.getCell(r, 3).value = Math.round(gr.a * 10) / 10
  s2.getCell(r, 4).value = Math.round(gr.b * 10) / 10
  s2.getCell(r, 5).value = Math.round(gr.f * 10) / 10
  s2.getCell(r, 6).value = Math.round(gr.p * 10) / 10
  s2.getCell(r, 7).value = Math.round((gr.a - gr.b) * 10) / 10
  for (let c = 3; c <= 7; c++) s2.getCell(r, c).numFmt = '#,##0.0;[Red]-#,##0.0'
  for (let c = 1; c <= 7; c++) {
    s2.getCell(r, c).fill = GRAND_FILL; s2.getCell(r, c).font = GRAND_FONT; s2.getCell(r, c).border = border
  }

  // ── Sheet 3: Monthly Trend (MONTH pivot) ───────────────────────────────────
  const s3 = wb.addWorksheet('Monthly Trend')
  s3.getCell('A1').value = 'ISG Net Revenue Monthly Trend FY26 (USD millions)'
  s3.getCell('A1').font = TITLE_FONT
  s3.mergeCells('A1:N1')

  const months = ['Oct-25', 'Nov-25', 'Dec-25', 'Jan-26', 'Feb-26', 'Mar-26', 'Apr-26', 'May-26', 'Jun-26', 'Jul-26', 'Aug-26', 'Sep-26']
  const h3 = ['Division', 'Metric', ...months]
  h3.forEach((h, i) => { s3.getCell(3, i + 1).value = h })
  styleHeaderRow(s3, 3, 1, h3.length)
  s3.getColumn(1).width = 22; s3.getColumn(2).width = 22
  for (let i = 3; i <= 14; i++) s3.getColumn(i).width = 11

  const monthlyRows = [
    ['Equities',            'Net Revenue',   315, 342, 298, 358, 342, 386, 342, 358, 358, 386, 342, 330],
    ['Equities',            'Compensation',  132, 144, 125, 150, 144, 162, 144, 150, 150, 162, 144, 139],
    ['Fixed Income',        'Net Revenue',   268, 292, 254, 302, 292, 328, 292, 302, 302, 328, 292, 280],
    ['Fixed Income',        'Compensation',  113, 123, 107, 127, 123, 138, 123, 127, 127, 138, 123, 118],
    ['Investment Banking',  'Net Revenue',   338, 375, 320, 385, 375, 410, 335, 355, 351, 395, 348, 298],
    ['Investment Banking',  'Compensation',  142, 158, 134, 162, 158, 172, 141, 149, 147, 166, 146, 125],
  ]
  monthlyRows.forEach((row, i) => {
    const rr = 4 + i
    row.forEach((v, ci) => { s3.getCell(rr, ci + 1).value = v })
    for (let c = 3; c <= 14; c++) s3.getCell(rr, c).numFmt = '#,##0'
    for (let c = 1; c <= 14; c++) s3.getCell(rr, c).border = border
  })

  const out = path.join(outDir, 'sample_pnl_attribution.xlsx')
  await wb.xlsx.writeFile(out)
  console.log('  ✓', out)
}

// ═══════════════════════════════════════════════════════════════════════════
// FILE 4: Rating Migration Matrix + Portfolio Distribution
// ═══════════════════════════════════════════════════════════════════════════
async function fileRatingMigration() {
  const wb = new ExcelJS.Workbook()
  wb.creator = 'Finance Connect PoC'
  wb.created = new Date()

  // ── Sheet 1: Cover ─────────────────────────────────────────────────────────
  const s1 = wb.addWorksheet('Cover')
  s1.getColumn(1).width = 24
  s1.getColumn(2).width = 80
  s1.getCell('A1').value = 'Credit Rating Migration Study — Annual'
  s1.getCell('A1').font = TITLE_FONT
  s1.mergeCells('A1:B1')
  const info = [
    ['Observation Window', 'FY2025 (Oct-24 to Sep-25)'],
    ['Methodology',        'Cohort approach, weighted by exposure at start of window'],
    ['Rating Scale',       'S&P long-term issuer credit rating (external)'],
    ['Portfolio Coverage', 'MSCO Corporate + Financial Institutions book (11,842 obligors)'],
    ['Interpretation',     'Row = rating at start | Column = rating at end | Cell = migration probability'],
    ['Regulatory Use',     'Basel IRB — internal validation input. Do NOT use for capital calculation directly.'],
    ['Owner',              'Credit Portfolio Management — Model Validation'],
  ]
  info.forEach(([k, v], i) => {
    const r = 3 + i
    s1.getCell(`A${r}`).value = k; s1.getCell(`A${r}`).font = { bold: true, size: 10 }
    s1.getCell(`B${r}`).value = v; s1.getCell(`B${r}`).font = { size: 10 }
  })

  // ── Sheet 2: Migration Matrix (classic FROM x TO crosstab) ─────────────────
  const s2 = wb.addWorksheet('Migration Matrix')
  s2.getCell('A1').value = 'FY2025 Rating Migration Matrix (probability of migration)'
  s2.getCell('A1').font = TITLE_FONT
  s2.mergeCells('A1:J1')
  s2.getCell('A2').value = 'From (row) → To (column). Row totals sum to 100%.'
  s2.getCell('A2').font = NOTE_FONT

  const buckets = ['AAA', 'AA', 'A', 'BBB', 'BB', 'B', 'CCC', 'D (Default)']
  // Header row 4
  s2.getCell(4, 1).value = 'From Rating \\ To Rating'
  buckets.forEach((b, i) => { s2.getCell(4, i + 2).value = b })
  styleHeaderRow(s2, 4, 1, buckets.length + 1)
  s2.getColumn(1).width = 22
  for (let i = 2; i <= buckets.length + 1; i++) s2.getColumn(i).width = 12

  // Approximate S&P long-run transition matrix
  const matrix = [
    // AAA    AA     A      BBB    BB     B      CCC    D
    [0.9080, 0.0833, 0.0068, 0.0006, 0.0012, 0.0000, 0.0000, 0.0001], // AAA
    [0.0070, 0.9065, 0.0779, 0.0064, 0.0006, 0.0014, 0.0002, 0.0000], // AA
    [0.0009, 0.0227, 0.9105, 0.0552, 0.0074, 0.0026, 0.0001, 0.0006], // A
    [0.0002, 0.0033, 0.0595, 0.8693, 0.0530, 0.0117, 0.0012, 0.0018], // BBB
    [0.0003, 0.0014, 0.0067, 0.0773, 0.8053, 0.0884, 0.0100, 0.0106], // BB
    [0.0000, 0.0011, 0.0024, 0.0043, 0.0648, 0.8346, 0.0407, 0.0521], // B
    [0.0022, 0.0000, 0.0022, 0.0130, 0.0238, 0.1124, 0.6486, 0.1978], // CCC
    [0.0000, 0.0000, 0.0000, 0.0000, 0.0000, 0.0000, 0.0000, 1.0000], // D (absorbing)
  ]
  matrix.forEach((row, i) => {
    const r = 5 + i
    s2.getCell(r, 1).value = buckets[i]
    s2.getCell(r, 1).font = { bold: true }
    s2.getCell(r, 1).border = border
    row.forEach((v, j) => {
      const cell = s2.getCell(r, j + 2)
      cell.value = v
      cell.numFmt = '0.00%'
      cell.border = border
      // Highlight diagonal (stayed at same rating)
      if (i === j) cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE8F5E9' } }
      // Highlight default column
      if (j === buckets.length - 1) cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFEBEE' } }
    })
  })

  // ── Sheet 3: Portfolio Distribution by Rating ──────────────────────────────
  const s3 = wb.addWorksheet('Portfolio by Rating')
  s3.getCell('A1').value = 'Portfolio Distribution by Rating — Snapshot 2026-09-14'
  s3.getCell('A1').font = TITLE_FONT
  s3.mergeCells('A1:F1')
  const distHead = ['Rating', 'Category', '# Obligors', 'Exposure USD (m)', 'Avg PD %', 'Concentration %']
  distHead.forEach((h, i) => { s3.getCell(3, i + 1).value = h })
  styleHeaderRow(s3, 3, 1, distHead.length)
  s3.getColumn(1).width = 12; s3.getColumn(2).width = 20
  for (let i = 3; i <= 6; i++) s3.getColumn(i).width = 16

  const dist = [
    ['AAA',        'Investment Grade',    148,  1240, 0.0002],
    ['AA',         'Investment Grade',    412,  3820, 0.0008],
    ['A',          'Investment Grade',   1284,  7960, 0.0022],
    ['BBB',        'Investment Grade',   2842, 12480, 0.0068],
    ['BB',         'Speculative Grade',  2168,  7240, 0.0284],
    ['B',          'Speculative Grade',  1642,  4180, 0.1240],
    ['CCC',        'Speculative Grade',   428,   980, 0.2480],
    ['D (Default)','Defaulted',            42,   180, 1.0000],
  ]
  const totalExp = dist.reduce((a, r) => a + r[3], 0)
  dist.forEach((row, i) => {
    const r = 4 + i
    row.forEach((v, ci) => { s3.getCell(r, ci + 1).value = v })
    s3.getCell(r, 3).numFmt = '#,##0'
    s3.getCell(r, 4).numFmt = '#,##0'
    s3.getCell(r, 5).numFmt = '0.0000%'
    s3.getCell(r, 6).value = row[3] / totalExp
    s3.getCell(r, 6).numFmt = '0.0%'
    for (let c = 1; c <= 6; c++) s3.getCell(r, c).border = border
  })

  const out = path.join(outDir, 'sample_rating_migration.xlsx')
  await wb.xlsx.writeFile(out)
  console.log('  ✓', out)
}

// ═══════════════════════════════════════════════════════════════════════════
// FILE 5: Regulatory Capital & RWA — multi-pivot + stress scenarios
// ═══════════════════════════════════════════════════════════════════════════
async function fileCapitalRWA() {
  const wb = new ExcelJS.Workbook()
  wb.creator = 'Finance Connect PoC'
  wb.created = new Date()

  // ── Sheet 1: Instructions ──────────────────────────────────────────────────
  const s1 = wb.addWorksheet('Instructions')
  s1.getColumn(1).width = 24
  s1.getColumn(2).width = 82
  s1.getCell('A1').value = 'Capital & RWA Regulatory Report — Quarterly'
  s1.getCell('A1').font = TITLE_FONT
  s1.mergeCells('A1:B1')
  const inst = [
    ['Reporting Frequency',   'Quarterly, submitted to Federal Reserve within 30 days of quarter-end'],
    ['Framework',             'Basel III (US implementation) + FRTB SA for market risk'],
    ['Legal Entities',        'MSCO consolidated, plus material subsidiaries MSBNA and MSIUK'],
    ['Currency',              'USD billions unless stated'],
    ['Ratios',                'CET1, Tier 1, Total Capital, Leverage — as % of RWA (leverage as % of exposure)'],
    ['Regulatory Minimums',   'CET1 ≥ 4.5%, Tier 1 ≥ 6.0%, Total ≥ 8.0%, Leverage ≥ 3.0%'],
    ['SCB',                   'Stress Capital Buffer set by 2026 CCAR = 5.5% for MS'],
    ['G-SIB Surcharge',       '3.0% for Morgan Stanley (Bucket 3)'],
    ['Data Cutoff',           'T+15 days post quarter-end. Report signed off by CFO and CRO.'],
    ['Related Reports',       'FR Y-9C, FFIEC 101, Y-14Q. This sheet is management summary only.'],
  ]
  inst.forEach(([k, v], i) => {
    const r = 3 + i
    s1.getCell(`A${r}`).value = k; s1.getCell(`A${r}`).font = { bold: true, size: 10 }
    s1.getCell(`B${r}`).value = v; s1.getCell(`B${r}`).font = { size: 10 }
    s1.getCell(`B${r}`).alignment = { wrapText: true, vertical: 'top' }
    s1.getRow(r).height = 20
  })

  // ── Sheet 2: RWA Summary — Multiple pivots on one sheet ────────────────────
  const s2 = wb.addWorksheet('RWA Summary')
  s2.getCell('A1').value = 'RWA & Capital Summary — Q3 FY26'
  s2.getCell('A1').font = TITLE_FONT
  s2.mergeCells('A1:G1')
  s2.getColumn(1).width = 28
  for (let i = 2; i <= 8; i++) s2.getColumn(i).width = 13

  // Pivot A: RWA by Risk Type × Quarter (USD bn)
  s2.getCell('A3').value = 'Pivot A — RWA by Risk Type across Quarters (USD bn)'
  s2.getCell('A3').font = { bold: true, size: 12, color: { argb: 'FF1E3A5F' } }
  const aQuarters = ['Q3 FY25', 'Q4 FY25', 'Q1 FY26', 'Q2 FY26', 'Q3 FY26']
  const aHead = ['Risk Type', ...aQuarters]
  aHead.forEach((h, i) => { s2.getCell(4, i + 1).value = h })
  styleHeaderRow(s2, 4, 1, aHead.length)
  const rwaByRisk = [
    ['Credit Risk',            342.6, 348.2, 356.4, 362.8, 371.2],
    ['Market Risk (FRTB SA)',   82.4,  86.8,  84.2,  88.6,  92.4],
    ['Operational Risk',        68.2,  68.2,  70.4,  70.4,  72.6],
    ['CVA Risk',                18.4,  19.2,  18.8,  20.4,  21.6],
  ]
  rwaByRisk.forEach((row, i) => {
    const r = 5 + i
    row.forEach((v, ci) => {
      const cell = s2.getCell(r, ci + 1)
      cell.value = v
      cell.border = border
      if (ci >= 1) cell.numFmt = '#,##0.0'
    })
  })
  const totalRow = 5 + rwaByRisk.length
  s2.getCell(totalRow, 1).value = 'Total RWA'
  for (let q = 0; q < aQuarters.length; q++) {
    const sum = rwaByRisk.reduce((a, r) => a + r[q + 1], 0)
    const cell = s2.getCell(totalRow, q + 2)
    cell.value = Math.round(sum * 10) / 10
    cell.numFmt = '#,##0.0'
  }
  for (let c = 1; c <= aQuarters.length + 1; c++) {
    s2.getCell(totalRow, c).fill = GRAND_FILL
    s2.getCell(totalRow, c).font = GRAND_FONT
    s2.getCell(totalRow, c).border = border
  }

  // Pivot B: Capital Ratios by Legal Entity × Scenario
  const bStart = totalRow + 3
  s2.getCell(`A${bStart}`).value = 'Pivot B — Capital Ratios by Legal Entity across Scenarios'
  s2.getCell(`A${bStart}`).font = { bold: true, size: 12, color: { argb: 'FF1E3A5F' } }
  const bScenarios = ['Actual Q3 FY26', 'Budget FY26', 'CCAR Baseline', 'CCAR Adverse', 'CCAR Severely Adverse']
  const bHead = ['Legal Entity', 'Ratio', ...bScenarios]
  bHead.forEach((h, i) => { s2.getCell(bStart + 1, i + 1).value = h })
  styleHeaderRow(s2, bStart + 1, 1, bHead.length)
  const capRows = [
    ['MSCO Consolidated', 'CET1 %',          0.146, 0.145, 0.142, 0.128, 0.104],
    ['MSCO Consolidated', 'Tier 1 %',        0.168, 0.166, 0.164, 0.148, 0.122],
    ['MSCO Consolidated', 'Total Capital %', 0.192, 0.190, 0.186, 0.170, 0.144],
    ['MSCO Consolidated', 'Leverage %',      0.062, 0.061, 0.060, 0.054, 0.046],
    ['MSBNA',             'CET1 %',          0.132, 0.130, 0.128, 0.116, 0.096],
    ['MSBNA',             'Tier 1 %',        0.148, 0.146, 0.144, 0.132, 0.108],
    ['MSBNA',             'Total Capital %', 0.172, 0.170, 0.166, 0.150, 0.124],
    ['MSIUK',             'CET1 %',          0.156, 0.155, 0.152, 0.138, 0.114],
    ['MSIUK',             'Tier 1 %',        0.178, 0.176, 0.174, 0.158, 0.132],
    ['MSIUK',             'Total Capital %', 0.202, 0.200, 0.196, 0.180, 0.154],
  ]
  capRows.forEach((row, i) => {
    const r = bStart + 2 + i
    row.forEach((v, ci) => {
      const cell = s2.getCell(r, ci + 1)
      cell.value = v
      cell.border = border
      if (ci >= 2) cell.numFmt = '0.00%'
    })
  })

  // Pivot C: Business Segment RWA breakdown
  const cStart = bStart + 2 + capRows.length + 3
  s2.getCell(`A${cStart}`).value = 'Pivot C — RWA by Business Segment (USD bn) — Q3 FY26'
  s2.getCell(`A${cStart}`).font = { bold: true, size: 12, color: { argb: 'FF1E3A5F' } }
  const cHead = ['Segment', 'Credit RWA', 'Market RWA', 'Operational RWA', 'CVA RWA', 'Total RWA']
  cHead.forEach((h, i) => { s2.getCell(cStart + 1, i + 1).value = h })
  styleHeaderRow(s2, cStart + 1, 1, cHead.length)
  const segRWA = [
    ['Institutional Securities', 218.4, 84.2, 42.6, 18.2],
    ['Wealth Management',         98.6,  4.8, 18.2,  1.4],
    ['Investment Management',     28.4,  3.2,  8.6,  0.8],
    ['Corporate / Other',         25.8,  0.2,  3.2,  1.2],
  ]
  segRWA.forEach((row, i) => {
    const r = cStart + 2 + i
    const total = row.slice(1).reduce((a, b) => a + b, 0)
    row.forEach((v, ci) => {
      const cell = s2.getCell(r, ci + 1)
      cell.value = v
      cell.border = border
      if (ci >= 1) cell.numFmt = '#,##0.0'
    })
    const totCell = s2.getCell(r, 6)
    totCell.value = Math.round(total * 10) / 10
    totCell.numFmt = '#,##0.0'
    totCell.font = { bold: true }
    totCell.border = border
  })

  // ── Sheet 3: CCAR Stress Scenarios ─────────────────────────────────────────
  const s3 = wb.addWorksheet('CCAR Stress')
  s3.getCell('A1').value = 'CCAR 2026 Stress Test Results — 9 Quarter Horizon'
  s3.getCell('A1').font = TITLE_FONT
  s3.mergeCells('A1:K1')
  s3.getCell('A2').value = 'Projected losses and capital under three supervisory scenarios (USD billions)'
  s3.getCell('A2').font = NOTE_FONT

  const ccarHead = ['Line Item', 'Scenario', 'Q1', 'Q2', 'Q3', 'Q4', 'Q5', 'Q6', 'Q7', 'Q8', 'Q9']
  ccarHead.forEach((h, i) => { s3.getCell(4, i + 1).value = h })
  styleHeaderRow(s3, 4, 1, ccarHead.length)
  s3.getColumn(1).width = 28; s3.getColumn(2).width = 22
  for (let i = 3; i <= 11; i++) s3.getColumn(i).width = 9

  const ccarRows = [
    ['Pre-Provision Net Revenue', 'Baseline',           4.2, 4.3, 4.4, 4.5, 4.6, 4.7, 4.8, 4.9, 5.0],
    ['Pre-Provision Net Revenue', 'Adverse',            3.8, 3.6, 3.4, 3.4, 3.5, 3.6, 3.8, 3.9, 4.0],
    ['Pre-Provision Net Revenue', 'Severely Adverse',   3.2, 2.6, 2.2, 2.0, 2.2, 2.5, 2.8, 3.1, 3.4],
    ['Total Loan Losses',         'Baseline',           0.4, 0.4, 0.5, 0.5, 0.5, 0.5, 0.6, 0.6, 0.6],
    ['Total Loan Losses',         'Adverse',            0.8, 1.2, 1.6, 1.8, 1.8, 1.6, 1.4, 1.2, 1.0],
    ['Total Loan Losses',         'Severely Adverse',   1.4, 2.4, 3.2, 3.8, 3.6, 3.2, 2.8, 2.4, 2.0],
    ['Trading & CVA Losses',      'Baseline',           0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0],
    ['Trading & CVA Losses',      'Adverse',            1.2, 0.8, 0.4, 0.2, 0.0, 0.0, 0.0, 0.0, 0.0],
    ['Trading & CVA Losses',      'Severely Adverse',   2.8, 1.8, 1.2, 0.6, 0.2, 0.0, 0.0, 0.0, 0.0],
    ['Projected CET1 Ratio %',    'Baseline',          14.6,14.7,14.7,14.8,14.9,15.0,15.1,15.2,15.3],
    ['Projected CET1 Ratio %',    'Adverse',           14.2,13.6,12.8,12.4,12.4,12.6,12.8,13.0,13.2],
    ['Projected CET1 Ratio %',    'Severely Adverse',  13.4,11.8,10.4, 9.8,10.2,10.6,11.0,11.4,11.8],
  ]
  ccarRows.forEach((row, i) => {
    const r = 5 + i
    row.forEach((v, ci) => {
      const cell = s3.getCell(r, ci + 1)
      cell.value = v
      cell.border = border
      if (ci >= 2) cell.numFmt = row[0].includes('Ratio') ? '0.0' : '#,##0.0'
    })
  })

  const out = path.join(outDir, 'sample_capital_rwa.xlsx')
  await wb.xlsx.writeFile(out)
  console.log('  ✓', out)
}

// ═══════════════════════════════════════════════════════════════════════════
// Run all
// ═══════════════════════════════════════════════════════════════════════════
console.log('Generating sample EUC files...')
await fileTrade()
await fileCreditConcentration()
await filePnLAttribution()
await fileRatingMigration()
await fileCapitalRWA()
console.log('Done.')
