import ExcelJS from 'exceljs'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'

const __dirname = dirname(fileURLToPath(import.meta.url))
const OUT = join(__dirname, '..', 'public', 'Level2_FX_Exposure_EUC.xlsx')

const wb = new ExcelJS.Workbook()
wb.creator = 'Finance Team'
wb.created = new Date('2026-01-15')

// ─── helpers ────────────────────────────────────────────────────────────────
const hdrFill  = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1F3864' } }
const hdrFont  = { bold: true, color: { argb: 'FFFFFFFF' }, size: 10 }
const titleFill= { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFD6E4F0' } }
const titleFont= { bold: true, size: 12 }
const altFill  = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF5F8FB' } }
const numFmt2  = '#,##0.00'
const dateFmt  = 'DD-MMM-YYYY'

function setHdr(row, values) {
  row.values = values
  row.eachCell(c => {
    c.fill = hdrFill
    c.font = hdrFont
    c.alignment = { vertical: 'middle' }
    c.border = { bottom: { style: 'thin', color: { argb: 'FFAAAAAA' } } }
  })
  row.height = 18
}

function stripe(row, idx) {
  if (idx % 2 === 0) row.eachCell(c => { c.fill = altFill })
}

// ─── Sheet 1: FX Trade Register ─────────────────────────────────────────────
const tradeSheet = wb.addWorksheet('FX Trade Register')
tradeSheet.properties.tabColor = { argb: 'FF1F3864' }

// Title + metadata
tradeSheet.mergeCells('A1:J1')
const t1 = tradeSheet.getCell('A1')
t1.value = 'FX TRADE REGISTER — Q1 2026'
t1.fill = titleFill
t1.font = titleFont
t1.alignment = { horizontal: 'center' }

tradeSheet.getCell('A2').value = 'As of Date:'
tradeSheet.getCell('B2').value = new Date('2026-03-31')
tradeSheet.getCell('B2').numFmt = dateFmt
tradeSheet.getCell('D2').value = 'Desk:'
tradeSheet.getCell('E2').value = 'FX Derivatives'
tradeSheet.getCell('G2').value = 'Status:'
tradeSheet.getCell('H2').value = 'ACTIVE'

// blank row 3
setHdr(tradeSheet.getRow(4), [
  'Trade ID', 'Trade Date', 'Value Date', 'Product', 'Counterparty ID',
  'Buy Currency', 'Buy Amount', 'Sell Currency', 'Sell Amount',
  'MTM (USD)', 'Trader', 'Status'
])
tradeSheet.columns = [
  { key: 'tradeId',   width: 14 },
  { key: 'tradeDate', width: 14 },
  { key: 'valueDate', width: 14 },
  { key: 'product',   width: 16 },
  { key: 'cpId',      width: 14 },
  { key: 'buyCcy',    width: 10 },
  { key: 'buyAmt',    width: 16 },
  { key: 'sellCcy',   width: 10 },
  { key: 'sellAmt',   width: 16 },
  { key: 'mtm',       width: 16 },
  { key: 'trader',    width: 14 },
  { key: 'status',    width: 10 },
]

const products = ['FX Spot', 'FX Forward', 'FX Option', 'NDF']
const cps = ['CP001', 'CP002', 'CP003', 'CP004', 'CP005']
const ccys = ['EUR', 'GBP', 'JPY', 'AUD', 'CHF', 'CAD']
const traders = ['J.Smith', 'A.Patel', 'L.Chen', 'M.Brown']
const statuses = ['LIVE', 'LIVE', 'LIVE', 'LIVE', 'MATURED', 'CANCELLED']

const tradeRows = []
for (let i = 1; i <= 80; i++) {
  const buyCcy = ccys[i % ccys.length]
  const sellCcy = 'USD'
  const buyAmt = Math.round((100000 + Math.random() * 4900000) * 100) / 100
  const rate = 0.85 + Math.random() * 0.3
  const sellAmt = Math.round(buyAmt * rate * 100) / 100
  const mtm = Math.round((Math.random() * 200000 - 100000) * 100) / 100
  const tradeDate = new Date(2026, 0, 2 + Math.floor(Math.random() * 60))
  const valueDate = new Date(tradeDate.getTime() + (2 + Math.floor(Math.random() * 180)) * 86400000)
  tradeRows.push({
    tradeId:   `TRD-2026-${String(i).padStart(4, '0')}`,
    tradeDate,
    valueDate,
    product:   products[i % products.length],
    cpId:      cps[i % cps.length],
    buyCcy,
    buyAmt,
    sellCcy,
    sellAmt,
    mtm,
    trader:    traders[i % traders.length],
    status:    statuses[i % statuses.length],
  })
}

tradeRows.forEach((r, idx) => {
  const row = tradeSheet.addRow([
    r.tradeId, r.tradeDate, r.valueDate, r.product, r.cpId,
    r.buyCcy, r.buyAmt, r.sellCcy, r.sellAmt, r.mtm, r.trader, r.status
  ])
  row.getCell(2).numFmt = dateFmt
  row.getCell(3).numFmt = dateFmt
  row.getCell(7).numFmt = numFmt2
  row.getCell(9).numFmt = numFmt2
  row.getCell(10).numFmt = numFmt2
  stripe(row, idx)
})

// Totals row
const totRow = tradeSheet.addRow([
  'TOTAL', '', '', '', '',
  '', { formula: `SUM(G5:G${4 + tradeRows.length})` },
  '', { formula: `SUM(I5:I${4 + tradeRows.length})` },
  { formula: `SUM(J5:J${4 + tradeRows.length})` },
  '', ''
])
totRow.font = { bold: true }
totRow.getCell(7).numFmt = numFmt2
totRow.getCell(9).numFmt = numFmt2
totRow.getCell(10).numFmt = numFmt2

tradeSheet.autoFilter = { from: 'A4', to: 'L4' }
tradeSheet.views = [{ state: 'frozen', ySplit: 4 }]

// ─── Sheet 2: Counterparty Master ───────────────────────────────────────────
const cpSheet = wb.addWorksheet('Counterparty Master')
cpSheet.properties.tabColor = { argb: 'FF2E75B6' }

cpSheet.mergeCells('A1:G1')
const t2 = cpSheet.getCell('A1')
t2.value = 'COUNTERPARTY MASTER DATA'
t2.fill = titleFill
t2.font = titleFont
t2.alignment = { horizontal: 'center' }

setHdr(cpSheet.getRow(3), [
  'CP ID', 'Legal Name', 'Country', 'Sector', 'Credit Rating', 'LEI', 'Status'
])
cpSheet.columns = [
  { key: 'cpId',    width: 10 },
  { key: 'name',    width: 34 },
  { key: 'country', width: 14 },
  { key: 'sector',  width: 20 },
  { key: 'rating',  width: 14 },
  { key: 'lei',     width: 24 },
  { key: 'status',  width: 10 },
]

const cpData = [
  ['CP001', 'Deutsche Bank AG',          'Germany',       'Banking',        'AA-',  '7LTWFZYICNSX8D621K86', 'ACTIVE'],
  ['CP002', 'BNP Paribas SA',            'France',        'Banking',        'A+',   'R0MUWSFPU8MPRO8K5P83', 'ACTIVE'],
  ['CP003', 'HSBC Holdings plc',         'United Kingdom','Banking',        'AA-',  'MLU0ZO3ML4LN2LL2TL39', 'ACTIVE'],
  ['CP004', 'Citibank N.A.',             'United States', 'Banking',        'A',    'E57ODZWZ7FF32TWEFA76', 'ACTIVE'],
  ['CP005', 'Goldman Sachs International','United States','Investment Bank','A+',   'W22LROWP2IHZNBB6K528', 'ACTIVE'],
  ['CP006', 'Mitsubishi UFJ Financial',  'Japan',         'Banking',        'A-',   'PIIKFRQZP7DDSZF10Y42', 'ACTIVE'],
  ['CP007', 'Société Générale SA',       'France',        'Banking',        'A',    'O2RNE8IBXP4R0TD8PH29', 'ACTIVE'],
  ['CP008', 'Barclays Bank PLC',         'United Kingdom','Banking',        'A',    'G5GSEF7VJP5I7OUK5573', 'REVIEW'],
  ['CP009', 'Standard Chartered PLC',   'United Kingdom','Banking',        'BBB+', 'RILFO74KP1CM8P6PCT96', 'ACTIVE'],
  ['CP010', 'ING Bank N.V.',             'Netherlands',   'Banking',        'A+',   '3TK20IVIUJ8J3ZU0QE75', 'ACTIVE'],
]

cpData.forEach((r, idx) => {
  const row = cpSheet.addRow(r)
  stripe(row, idx)
})

// ─── Sheet 3: MTM Summary ────────────────────────────────────────────────────
const mtmSheet = wb.addWorksheet('MTM Summary')
mtmSheet.properties.tabColor = { argb: 'FF70AD47' }

mtmSheet.mergeCells('A1:H1')
const t3 = mtmSheet.getCell('A1')
t3.value = 'MARK-TO-MARKET SUMMARY BY CURRENCY PAIR — Q1 2026'
t3.fill = titleFill
t3.font = titleFont
t3.alignment = { horizontal: 'center' }

mtmSheet.getCell('A2').value = 'USD Equivalent | Figures in thousands'
mtmSheet.getCell('A2').font = { italic: true, size: 9, color: { argb: 'FF666666' } }

setHdr(mtmSheet.getRow(4), [
  'Currency Pair', 'Product', 'Notional (USD)', 'Avg Rate', 'MTM Jan-26', 'MTM Feb-26', 'MTM Mar-26', 'Q1 Total MTM'
])
mtmSheet.columns = [
  { key: 'pair',     width: 14 },
  { key: 'product',  width: 16 },
  { key: 'notional', width: 18 },
  { key: 'avgRate',  width: 12 },
  { key: 'jan',      width: 16 },
  { key: 'feb',      width: 16 },
  { key: 'mar',      width: 16 },
  { key: 'q1',       width: 16 },
]

const mtmData = [
  ['EUR/USD', 'FX Spot',    45200000, 1.0823,   312500,  -145200,   89300],
  ['EUR/USD', 'FX Forward', 78500000, 1.0791,  -245000,   412300, -189000],
  ['EUR/USD', 'FX Option',  12300000, 1.0850,   145000,    67800,  234500],
  ['GBP/USD', 'FX Spot',    23400000, 1.2634,   -89200,   156700,  -45600],
  ['GBP/USD', 'FX Forward', 56700000, 1.2610,   345600,  -234500,  123400],
  ['GBP/USD', 'NDF',        18900000, 1.2658,   -23400,    45600,   78900],
  ['JPY/USD', 'FX Spot',    89000000, 0.0067,   456700,  -345600,  234500],
  ['JPY/USD', 'FX Forward', 34500000, 0.0066,  -123400,   234500, -156700],
  ['AUD/USD', 'FX Spot',    15600000, 0.6523,    67800,   -89200,   45600],
  ['AUD/USD', 'FX Forward', 28900000, 0.6498,  -145600,   178900,  -67800],
  ['CHF/USD', 'FX Spot',    19800000, 1.1234,   234500,  -123400,   89200],
  ['CHF/USD', 'NDF',        11200000, 1.1198,    -56700,    78900,  -34500],
  ['CAD/USD', 'FX Spot',    31200000, 0.7412,   178900,   -67800,  123400],
  ['CAD/USD', 'FX Forward', 22100000, 0.7389,   -89200,   156700,  -78900],
]

mtmData.forEach((r, idx) => {
  const [pair, product, notional, avgRate, jan, feb, mar] = r
  const rowNum = 4 + idx + 1
  const row = mtmSheet.addRow([
    pair, product, notional, avgRate, jan, feb, mar,
    { formula: `E${rowNum}+F${rowNum}+G${rowNum}` }
  ])
  row.getCell(3).numFmt = '#,##0'
  row.getCell(4).numFmt = '0.0000'
  row.getCell(5).numFmt = numFmt2
  row.getCell(6).numFmt = numFmt2
  row.getCell(7).numFmt = numFmt2
  row.getCell(8).numFmt = numFmt2
  stripe(row, idx)
})

// Grand total
const gtRow = mtmSheet.addRow([
  'GRAND TOTAL', '', '',  '',
  { formula: `SUM(E5:E${4 + mtmData.length})` },
  { formula: `SUM(F5:F${4 + mtmData.length})` },
  { formula: `SUM(G5:G${4 + mtmData.length})` },
  { formula: `SUM(H5:H${4 + mtmData.length})` },
])
gtRow.font = { bold: true }
gtRow.eachCell(c => { c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE2EFDA' } } })
for (let c = 5; c <= 8; c++) gtRow.getCell(c).numFmt = numFmt2

// ─── Sheet 4: Risk Parameters ─────────────────────────────────────────────
const paramSheet = wb.addWorksheet('Risk Parameters')
paramSheet.properties.tabColor = { argb: 'FFED7D31' }

paramSheet.mergeCells('A1:C1')
const t4 = paramSheet.getCell('A1')
t4.value = 'RISK & VALUATION PARAMETERS'
t4.fill = titleFill
t4.font = titleFont
t4.alignment = { horizontal: 'center' }

setHdr(paramSheet.getRow(3), ['Parameter Name', 'Value', 'Last Updated'])
paramSheet.columns = [
  { key: 'param',   width: 34 },
  { key: 'value',   width: 20 },
  { key: 'updated', width: 16 },
]

const params = [
  ['Risk-Free Rate (USD)',          '5.25%',          new Date('2026-03-01')],
  ['Risk-Free Rate (EUR)',          '4.00%',          new Date('2026-03-01')],
  ['Risk-Free Rate (GBP)',          '5.00%',          new Date('2026-03-01')],
  ['Risk-Free Rate (JPY)',          '0.10%',          new Date('2026-03-01')],
  ['VaR Confidence Level',          '99%',            new Date('2026-01-01')],
  ['VaR Holding Period (days)',     '10',             new Date('2026-01-01')],
  ['Stress Test Scenario',          'ECB-2026-ADV',   new Date('2026-02-15')],
  ['MTM Discounting Curve',         'OIS',            new Date('2026-01-01')],
  ['Counterparty Default Threshold','USD 5,000,000',  new Date('2026-01-01')],
  ['Large Trade Threshold',         'USD 10,000,000', new Date('2026-01-01')],
  ['Reporting Currency',            'USD',            new Date('2026-01-01')],
  ['Decimal Places (Rates)',        '4',              new Date('2026-01-01')],
  ['FX Settlement T+',              '2',              new Date('2026-01-01')],
  ['Option Pricing Model',          'Black-Scholes',  new Date('2026-01-01')],
  ['Last Full Revaluation',         new Date('2026-03-28'), new Date('2026-03-28')],
  ['Next Scheduled Revaluation',    new Date('2026-04-01'), new Date('2026-03-31')],
]

params.forEach((r, idx) => {
  const row = paramSheet.addRow(r)
  if (r[1] instanceof Date) row.getCell(2).numFmt = dateFmt
  if (r[2] instanceof Date) row.getCell(3).numFmt = dateFmt
  stripe(row, idx)
})

// ─── Write file ──────────────────────────────────────────────────────────────
import { mkdirSync } from 'fs'
mkdirSync(join(__dirname, '..', 'public'), { recursive: true })
await wb.xlsx.writeFile(OUT)
console.log('✓ Written:', OUT)
