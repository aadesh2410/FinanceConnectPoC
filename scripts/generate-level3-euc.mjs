import ExcelJS from 'exceljs'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'
import { mkdirSync } from 'fs'

const __dirname = dirname(fileURLToPath(import.meta.url))
const OUT = join(__dirname, '..', 'public', 'Level3_Credit_Risk_EUC.xlsx')

const wb = new ExcelJS.Workbook()
wb.creator = 'Credit Risk Analytics'
wb.created = new Date('2026-09-30')

// ─── styling helpers ─────────────────────────────────────────────────────────
const catFill  = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1F3864' } }
const catFont  = { bold: true, color: { argb: 'FFFFFFFF' }, size: 10 }
const hdrFill  = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF2E75B6' } }
const hdrFont  = { bold: true, color: { argb: 'FFFFFFFF' }, size: 10 }
const titleFill= { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFD6E4F0' } }
const titleFont= { bold: true, size: 12 }
const altFill  = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF5F8FB' } }
const totalFill= { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFF2CC' } }
const warnFill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFD7D7' } }
const diagFill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFD6E4F0' } }

const moneyFmt = '$#,##0'
const money2   = '$#,##0.00'
const pdFmt    = '0.0000%'   // e.g. 0.0015 → 0.1500%
const pctFmt   = '0.00%'
const dateFmt  = 'DD-MMM-YYYY'
const rate4    = '0.0000'

const rng = (lo, hi) => Math.random() * (hi - lo) + lo

function setHdr(row, values) {
  row.values = values
  row.eachCell(c => {
    c.fill = hdrFill
    c.font = hdrFont
    c.alignment = { vertical: 'middle' }
    c.border = { bottom: { style: 'medium', color: { argb: 'FF1F3864' } } }
  })
  row.height = 20
}

function stripe(row, idx, warn = false) {
  if (warn)          row.eachCell(c => { c.fill = warnFill })
  else if (idx % 2 === 0) row.eachCell(c => { c.fill = altFill })
}

// ─── reference data ───────────────────────────────────────────────────────────
const counterparties = [
  { id:'CP001', name:'Deutsche Bank AG',           sector:'Banking',       country:'Germany',     rating:'AA-',  pd:0.0008, limit:2_000_000_000 },
  { id:'CP002', name:'BNP Paribas SA',              sector:'Banking',       country:'France',      rating:'A+',   pd:0.0012, limit:1_500_000_000 },
  { id:'CP003', name:'HSBC Holdings plc',           sector:'Banking',       country:'UK',          rating:'AA-',  pd:0.0007, limit:1_800_000_000 },
  { id:'CP004', name:'Citibank N.A.',               sector:'Banking',       country:'US',          rating:'A',    pd:0.0020, limit:1_200_000_000 },
  { id:'CP005', name:'Goldman Sachs International', sector:'Inv. Banking',  country:'US',          rating:'A+',   pd:0.0015, limit:1_000_000_000 },
  { id:'CP006', name:'Mitsubishi UFJ Financial',    sector:'Banking',       country:'Japan',       rating:'A-',   pd:0.0025, limit:900_000_000  },
  { id:'CP007', name:'Apple Inc',                   sector:'Technology',    country:'US',          rating:'AAA',  pd:0.0002, limit:500_000_000  },
  { id:'CP008', name:'Shell plc',                   sector:'Energy',        country:'UK',          rating:'AA',   pd:0.0006, limit:750_000_000  },
  { id:'CP009', name:'AstraZeneca plc',             sector:'Healthcare',    country:'UK',          rating:'A+',   pd:0.0014, limit:400_000_000  },
  { id:'CP010', name:'Volkswagen AG',               sector:'Automotive',    country:'Germany',     rating:'BBB+', pd:0.0065, limit:600_000_000  },
  { id:'CP011', name:'Allianz SE',                  sector:'Insurance',     country:'Germany',     rating:'AA',   pd:0.0006, limit:800_000_000  },
  { id:'CP012', name:'Berkshire Hathaway Finance',  sector:'Insurance',     country:'US',          rating:'AA+',  pd:0.0004, limit:1_000_000_000},
  { id:'CP013', name:'Enel SpA',                    sector:'Utilities',     country:'Italy',       rating:'BBB',  pd:0.0090, limit:350_000_000  },
  { id:'CP014', name:'Tesco PLC',                   sector:'Retail',        country:'UK',          rating:'BBB',  pd:0.0085, limit:200_000_000  },
  { id:'CP015', name:'TotalEnergies SE',            sector:'Energy',        country:'France',      rating:'A+',   pd:0.0013, limit:700_000_000  },
  { id:'CP016', name:'Roche Holding AG',            sector:'Healthcare',    country:'Switzerland', rating:'AAA',  pd:0.0001, limit:450_000_000  },
  { id:'CP017', name:'Vodafone Group PLC',          sector:'Telecom',       country:'UK',          rating:'BBB-', pd:0.0120, limit:300_000_000  },
  { id:'CP018', name:'Rio Tinto PLC',               sector:'Mining',        country:'UK',          rating:'A',    pd:0.0022, limit:500_000_000  },
  { id:'CP019', name:'Stellantis N.V.',             sector:'Automotive',    country:'Netherlands', rating:'BBB',  pd:0.0080, limit:400_000_000  },
  { id:'CP020', name:'Westpac Banking Corp',        sector:'Banking',       country:'Australia',   rating:'A-',   pd:0.0028, limit:600_000_000  },
]

// Instrument types — funded = no MTM (show N/A), eadFactor for derivative add-on
const instruments = [
  { name:'Credit Default Swap',   funded:false, lgdLo:0.40, lgdHi:0.60, eadFactor:0.05 },
  { name:'Senior Secured Loan',   funded:true,  lgdLo:0.20, lgdHi:0.35, eadFactor:1.00 },
  { name:'Senior Unsecured Bond', funded:true,  lgdLo:0.40, lgdHi:0.55, eadFactor:1.00 },
  { name:'Trade Finance LC',      funded:true,  lgdLo:0.25, lgdHi:0.40, eadFactor:0.50 },
  { name:'Interest Rate Swap',    funded:false, lgdLo:0.35, lgdHi:0.50, eadFactor:0.03 },
  { name:'Revolving Credit Fac.', funded:true,  lgdLo:0.30, lgdHi:0.45, eadFactor:0.75 },
]

// ─── Sheet 1: Credit Exposure Register (TRANSACTIONAL, multi-level headers) ──
const regSh = wb.addWorksheet('Credit Exposure Register')
regSh.properties.tabColor = { argb: 'FF1F3864' }

// Title
regSh.mergeCells('A1:O1')
const c1 = regSh.getCell('A1')
c1.value = 'CREDIT EXPOSURE REGISTER — Q3 2026'
c1.fill = titleFill; c1.font = titleFont; c1.alignment = { horizontal: 'center' }

// Metadata rows 2–3
regSh.getCell('A2').value = 'As of Date:'
regSh.getCell('B2').value = new Date('2026-09-30'); regSh.getCell('B2').numFmt = dateFmt
regSh.getCell('D2').value = 'Prepared By:'; regSh.getCell('E2').value = 'Credit Risk Analytics'
regSh.getCell('H2').value = 'Reporting CCY:'; regSh.getCell('I2').value = 'USD'
regSh.getCell('A3').value = 'Approved By:'; regSh.getCell('B3').value = 'Head of Credit Risk'
regSh.getCell('D3').value = 'Status:'; regSh.getCell('E3').value = 'FINAL'
regSh.getCell('H3').value = 'Counterparties:'; regSh.getCell('I3').value = 20
// rows 4–5: blank

// ── Row 6: multi-level category header (merged) ──
// A:D = Counterparty Info | E:G = Trade Details | H:I = Valuation | J:L = Credit Risk Metrics | M:O = Limits & Utilisation
regSh.mergeCells('A6:D6'); regSh.mergeCells('E6:G6')
regSh.mergeCells('H6:I6'); regSh.mergeCells('J6:L6'); regSh.mergeCells('M6:O6')
const cats = { A6:'Counterparty Information', E6:'Trade Details', H6:'Valuation', J6:'Credit Risk Metrics', M6:'Limits & Utilisation' }
for (const [addr, label] of Object.entries(cats)) {
  const c = regSh.getCell(addr)
  c.value = label; c.fill = catFill; c.font = catFont
  c.alignment = { horizontal: 'center', vertical: 'middle' }
}
regSh.getRow(6).height = 18

// ── Row 7: field-level header ──
setHdr(regSh.getRow(7), [
  'CP ID', 'Legal Name', 'Sector', 'Country',
  'Trade Date', 'Maturity Date', 'Instrument',
  'Notional USD', 'MTM USD',
  'PD 1Y', 'LGD', 'EAD USD',
  'Credit Limit USD', 'Current Exposure USD', 'Utilisation %',
])
regSh.columns = [
  {width:8},{width:30},{width:16},{width:14},
  {width:14},{width:14},{width:22},
  {width:16},{width:16},
  {width:10},{width:8},{width:16},
  {width:18},{width:20},{width:13},
]

// Cell comments on specialist fields in row 7
regSh.getCell('J7').note = {
  texts: [{ font:{ size:9 }, text:'PD 1Y: Probability of Default over 1-year horizon. From internal rating model mapped to Moody\'s scale. Floor of 0.03% applies to IG names.' }]
}
regSh.getCell('K7').note = {
  texts: [{ font:{ size:9 }, text:'LGD: Loss Given Default (%) estimated at facility level. Reflects seniority, collateral, and jurisdiction recovery norms.' }]
}
regSh.getCell('L7').note = {
  texts: [{ font:{ size:9 }, text:'EAD: Exposure at Default. Funded = Notional. Derivatives = Notional × regulatory add-on factor per CRR III Art. 274.' }]
}
regSh.getCell('I7').note = {
  texts: [{ font:{ size:9 }, text:'MTM: Mark-to-Market USD. N/A for funded instruments (Loans, Bonds, Trade Finance). Positive = asset for the bank.' }]
}
regSh.getCell('O7').note = {
  texts: [{ font:{ size:9 }, text:'Utilisation >80% triggers enhanced monitoring review. >100% is a hard limit breach requiring immediate CRO escalation.' }]
}

// ── 100 data rows (rows 8–107) ──
const rows100 = []
for (let i = 0; i < 100; i++) {
  const cp   = counterparties[i % counterparties.length]
  const inst = instruments[i % instruments.length]
  const notional = Math.round(rng(5_000_000, 500_000_000) / 1_000_000) * 1_000_000
  const lgd      = Math.round(rng(inst.lgdLo, inst.lgdHi) * 10000) / 10000
  const ead      = Math.round(notional * inst.eadFactor)
  const mtm      = inst.funded ? null : Math.round(rng(-notional * 0.03, notional * 0.03))
  const pd       = Math.round(cp.pd * rng(0.85, 1.15) * 100000) / 100000
  const tradeDate= new Date(2025, Math.floor(rng(0, 12)), Math.floor(rng(1, 28)))
  const matDate  = new Date(tradeDate.getTime() + Math.floor(rng(365, 3 * 365)) * 86400000)
  const util     = ead / cp.limit
  rows100.push({ cp, inst, notional, lgd, ead, mtm, pd, tradeDate, matDate, util, warn: util > 0.80 })
}
rows100.sort((a, b) => a.cp.id.localeCompare(b.cp.id))

rows100.forEach((r, idx) => {
  const row = regSh.addRow([
    r.cp.id, r.cp.name, r.cp.sector, r.cp.country,
    r.tradeDate, r.matDate, r.inst.name,
    r.notional,
    r.mtm !== null ? r.mtm : 'N/A',
    r.pd, r.lgd, r.ead,
    r.cp.limit, r.ead, r.util,
  ])
  row.getCell(5).numFmt  = dateFmt
  row.getCell(6).numFmt  = dateFmt
  row.getCell(8).numFmt  = moneyFmt
  if (r.mtm !== null) row.getCell(9).numFmt = money2
  row.getCell(10).numFmt = pdFmt
  row.getCell(11).numFmt = pctFmt
  row.getCell(12).numFmt = moneyFmt
  row.getCell(13).numFmt = moneyFmt
  row.getCell(14).numFmt = moneyFmt
  row.getCell(15).numFmt = pctFmt
  stripe(row, idx, r.warn)
})

const DATA_END = 107  // row 108 = totals
const totR1 = regSh.addRow([
  'TOTAL','','','','','','',
  {formula:`SUM(H8:H${DATA_END})`}, '',
  '','', {formula:`SUM(L8:L${DATA_END})`},
  {formula:`SUM(M8:M${DATA_END})`},
  {formula:`SUM(N8:N${DATA_END})`}, '',
])
totR1.font = { bold: true }
totR1.eachCell(c => { c.fill = totalFill })
totR1.getCell(8).numFmt  = moneyFmt
totR1.getCell(12).numFmt = moneyFmt
totR1.getCell(13).numFmt = moneyFmt
totR1.getCell(14).numFmt = moneyFmt

regSh.autoFilter = { from: 'A7', to: 'O7' }
regSh.views = [{ state: 'frozen', ySplit: 7 }]

// Named range covering header + data
// named range set at end

// ─── Sheet 2: Rating Migration Matrix (CROSSTAB) ─────────────────────────────
const migSh = wb.addWorksheet('Rating Migration Matrix')
migSh.properties.tabColor = { argb: 'FFED7D31' }

migSh.mergeCells('A1:J1')
const c2 = migSh.getCell('A1')
c2.value = "1-YEAR RATING MIGRATION MATRIX — MOODY'S SCALE (2023 ANNUAL STUDY)"
c2.fill = titleFill; c2.font = titleFont; c2.alignment = { horizontal: 'center' }

migSh.getCell('A2').value = 'Source:'
migSh.getCell('B2').value = "Moody's Annual Default & Rating Transition Study 2023"
migSh.getCell('A3').value = 'Usage:'
migSh.getCell('B3').value = 'Internal credit migration scenario modelling — restricted, not for external distribution'
migSh.getCell('B3').font = { italic: true, size: 9, color: { argb: 'FF666666' } }
migSh.getCell('A4').value = 'Row = Starting Rating | Column = Ending Rating | Values = 1-year transition probability'
migSh.getCell('A4').font = { italic: true, size: 9, color: { argb: 'FF666666' } }
// Row 5: blank

// Row 6: headers  From\To | AAA | AA | A | BBB | BB | B | CCC | D(Default) | Row Sum
const grades = ['AAA', 'AA', 'A', 'BBB', 'BB', 'B', 'CCC', 'D (Default)']
setHdr(migSh.getRow(6), ['From \\ To', ...grades, 'Row Sum'])

migSh.columns = [{ width: 16 }, ...Array(8).fill({ width: 12 }), { width: 10 }]

// Approximate Moody's 1-year transition matrix (rows/cols order: AAA→D)
const migMatrix = [
  [0.9241, 0.0634, 0.0060, 0.0013, 0.0006, 0.0003, 0.0002, 0.0001],  // from AAA
  [0.0072, 0.9072, 0.0770, 0.0058, 0.0013, 0.0009, 0.0002, 0.0004],  // from AA
  [0.0009, 0.0222, 0.9078, 0.0603, 0.0063, 0.0017, 0.0003, 0.0005],  // from A
  [0.0004, 0.0034, 0.0541, 0.8790, 0.0493, 0.0105, 0.0019, 0.0014],  // from BBB
  [0.0003, 0.0013, 0.0068, 0.0687, 0.8010, 0.0985, 0.0122, 0.0112],  // from BB
  [0.0001, 0.0006, 0.0050, 0.0150, 0.0780, 0.8154, 0.0629, 0.0230],  // from B
  [0.0001, 0.0003, 0.0023, 0.0065, 0.0182, 0.0989, 0.6279, 0.2458],  // from CCC
  [0,      0,      0,      0,      0,      0,      0,      1.0000],   // D — absorbing state
]

grades.forEach((grade, gi) => {
  const rowNum = 7 + gi
  const colLetters = ['B','C','D','E','F','G','H','I']
  const row = migSh.addRow([grade, ...migMatrix[gi], { formula: `SUM(B${rowNum}:I${rowNum})` }])
  // Style row label
  row.getCell(1).fill = hdrFill; row.getCell(1).font = { bold: true, color: { argb: 'FFFFFFFF' } }
  // Style probability cells
  for (let ci = 0; ci < 8; ci++) {
    const cell = row.getCell(ci + 2)
    cell.numFmt = pctFmt
    // Highlight diagonal (same-rating retention)
    if (ci === gi) { cell.fill = diagFill; cell.font = { bold: true } }
  }
  // Row sum
  row.getCell(10).numFmt = pctFmt
  row.getCell(10).font = { italic: true, color: { argb: 'FF444444' } }
})

// Note on absorbing default state
migSh.getCell('A14').note = {
  texts: [{ font:{ size:9 }, text:'Default (D) is an absorbing state: a defaulted issuer cannot be upgraded in the 1-year horizon. Recovery modelled separately via LGD parameters.' }]
}

// Validation note
migSh.getCell('A16').value = 'Note: Row sums should equal 100.00%. Diagonal entries (shaded) represent probability of rating stability.'
migSh.getCell('A16').font = { italic: true, size: 9, color: { argb: 'FF888888' } }
migSh.mergeCells('A16:J16')

// Named range covers header + all 8 data rows
// named range set at end

// ─── Sheet 3: Sector Concentration (SUMMARY, cross-sheet SUMIF formulas) ──────
const secSh = wb.addWorksheet('Sector Concentration')
secSh.properties.tabColor = { argb: 'FF70AD47' }

secSh.mergeCells('A1:G1')
const c3 = secSh.getCell('A1')
c3.value = 'CREDIT EXPOSURE BY SECTOR — Q3 2026 SUMMARY'
c3.fill = titleFill; c3.font = titleFont; c3.alignment = { horizontal: 'center' }

secSh.getCell('A2').value = 'Source: Credit Exposure Register (live SUMIF/COUNTIF — auto-recalculates on workbook open)'
secSh.getCell('A2').font = { italic: true, size: 9, color: { argb: 'FF666666' } }
secSh.mergeCells('A2:G2')
// Row 3: blank

// Row 4: sub-category header row (second level)
secSh.mergeCells('B4:D4')
secSh.mergeCells('E4:G4')
secSh.getCell('B4').value = 'Volume Metrics'
secSh.getCell('E4').value = 'Risk Indicators'
for (const col of ['B','E']) {
  const c = secSh.getCell(`${col}4`)
  c.fill = catFill; c.font = catFont; c.alignment = { horizontal:'center', vertical:'middle' }
}
secSh.getRow(4).height = 18

// Row 5: field-level headers
setHdr(secSh.getRow(5), ['Sector', 'Trade Count', 'Total Notional USD', 'Total EAD USD', 'Avg PD 1Y', 'Avg LGD', 'Exposure Share %'])
secSh.columns = [{width:20},{width:13},{width:22},{width:20},{width:12},{width:10},{width:16}]

const sectors = ['Banking','Inv. Banking','Technology','Energy','Healthcare','Automotive','Insurance','Utilities','Retail','Telecom','Mining']

sectors.forEach((sec, i) => {
  const rn = 6 + i
  const row = secSh.addRow([
    sec,
    { formula: `COUNTIF('Credit Exposure Register'!C:C,"${sec}")` },
    { formula: `SUMIF('Credit Exposure Register'!C:C,"${sec}",'Credit Exposure Register'!H:H)` },
    { formula: `SUMIF('Credit Exposure Register'!C:C,"${sec}",'Credit Exposure Register'!L:L)` },
    { formula: `AVERAGEIF('Credit Exposure Register'!C:C,"${sec}",'Credit Exposure Register'!J:J)` },
    { formula: `AVERAGEIF('Credit Exposure Register'!C:C,"${sec}",'Credit Exposure Register'!K:K)` },
    { formula: `D${rn}/SUM($D$6:$D$${5+sectors.length})` },
  ])
  row.getCell(3).numFmt = moneyFmt
  row.getCell(4).numFmt = moneyFmt
  row.getCell(5).numFmt = pdFmt
  row.getCell(6).numFmt = pctFmt
  row.getCell(7).numFmt = pctFmt
  if (i % 2 === 0) row.eachCell(c => { c.fill = altFill })
})

const SEC_END = 5 + sectors.length
const totR3 = secSh.addRow([
  'TOTAL',
  { formula: `SUM(B6:B${SEC_END})` },
  { formula: `SUM(C6:C${SEC_END})` },
  { formula: `SUM(D6:D${SEC_END})` },
  '', '',
  { formula: `SUM(G6:G${SEC_END})` },
])
totR3.font = { bold: true }
totR3.eachCell(c => { c.fill = totalFill })
totR3.getCell(3).numFmt = moneyFmt
totR3.getCell(4).numFmt = moneyFmt
totR3.getCell(7).numFmt = pctFmt

secSh.getCell(`A${SEC_END + 3}`).value = '* Avg PD and Avg LGD use AVERAGEIF — sectors with zero trades show #DIV/0 (expected, not an error)'
secSh.getCell(`A${SEC_END + 3}`).font = { italic: true, size: 9, color: { argb: 'FF888888' } }
secSh.mergeCells(`A${SEC_END + 3}:G${SEC_END + 3}`)

const _SEC_END = SEC_END  // capture for model below

// ─── Sheet 4: Counterparty Master (LOOKUP) ────────────────────────────────────
const cpSh = wb.addWorksheet('Counterparty Master')
cpSh.properties.tabColor = { argb: 'FF2E75B6' }

cpSh.mergeCells('A1:J1')
const c4 = cpSh.getCell('A1')
c4.value = 'COUNTERPARTY MASTER — APPROVED CREDIT COUNTERPARTIES'
c4.fill = titleFill; c4.font = titleFont; c4.alignment = { horizontal: 'center' }

cpSh.getCell('A2').value = 'Last Review Date:'
cpSh.getCell('B2').value = new Date('2026-08-01'); cpSh.getCell('B2').numFmt = dateFmt
cpSh.getCell('D2').value = 'Approved By:'; cpSh.getCell('E2').value = 'Credit Committee'
cpSh.getCell('H2').value = 'Next Review:'
cpSh.getCell('I2').value = new Date('2027-02-01'); cpSh.getCell('I2').numFmt = dateFmt
// Row 3: blank

setHdr(cpSh.getRow(4), ['CP ID','Legal Name','Short Name','Sector','Country','Internal Rating','External Rating','Credit Limit USD','Onboarding Date','Status'])
cpSh.columns = [{width:8},{width:32},{width:18},{width:16},{width:14},{width:16},{width:16},{width:18},{width:16},{width:10}]

counterparties.forEach((cp, i) => {
  const row = cpSh.addRow([
    cp.id, cp.name,
    cp.name.split(' ')[0],       // short name
    cp.sector, cp.country,
    cp.rating, cp.rating,        // int = ext for simplicity
    cp.limit,
    new Date(2018 + Math.floor(i / 5), i % 12, 1),
    i === 9 ? 'REVIEW' : 'ACTIVE',  // Volkswagen under review
  ])
  row.getCell(8).numFmt = moneyFmt
  row.getCell(9).numFmt = dateFmt
  if (i % 2 === 0) row.eachCell(c => { c.fill = altFill })
})

// Note on Volkswagen
cpSh.getCell('J13').note = {
  texts: [{ font:{ size:9 }, text:'CP010 under enhanced monitoring: Q2 2026 covenant breach on debt/EBITDA ratio. Limit freeze pending Credit Committee review (ref: CCM-2026-089).' }]
}

// named range set at end

// ─── Sheet 5: Risk Model Parameters (LOOKUP / config) ─────────────────────────
const prmSh = wb.addWorksheet('Risk Model Parameters')
prmSh.properties.tabColor = { argb: 'FFFF0000' }

prmSh.mergeCells('A1:F1')
const c5 = prmSh.getCell('A1')
c5.value = 'CREDIT RISK MODEL PARAMETERS & GOVERNANCE RECORD'
c5.fill = titleFill; c5.font = titleFont; c5.alignment = { horizontal: 'center' }

prmSh.getCell('A2').value = 'All parameter changes require Credit Risk Committee approval and must be logged in the model change register.'
prmSh.getCell('A2').font = { italic: true, size: 9, color: { argb: 'FF666666' } }
prmSh.mergeCells('A2:F2')
// Row 3: blank

setHdr(prmSh.getRow(4), ['Parameter', 'Value', 'Unit', 'Last Updated', 'Approved By', 'Notes'])
prmSh.columns = [{width:36},{width:22},{width:16},{width:16},{width:22},{width:52}]

const params = [
  ['VaR Confidence Level',               '99%',              'Percent',       new Date('2026-01-01'), 'CRC-2026-01',  'Basel III minimum 99% for internal models approach (IMA)'],
  ['VaR Holding Period',                  '10',               'Business Days', new Date('2026-01-01'), 'CRC-2026-01',  'Regulatory capital square root of time scaling from 1-day VaR'],
  ['Credit VaR Horizon',                  '1',                'Year',          new Date('2026-01-01'), 'CRC-2026-01',  'Annual horizon used for ICAAP credit VaR and stress testing'],
  ['PD Floor — Investment Grade',         '0.0300%',          'Percent',       new Date('2026-03-15'), 'CRC-2026-07',  'Minimum PD for BBB- and above per CRR III Art. 160'],
  ['PD Floor — Sub-Investment Grade',     '0.1000%',          'Percent',       new Date('2026-03-15'), 'CRC-2026-07',  'Minimum PD for BB+ and below per CRR III Art. 160'],
  ['LGD Floor — Senior Secured',          '20%',              'Percent',       new Date('2026-01-01'), 'CRC-2026-01',  'F-IRB LGD floor for collateralised exposures'],
  ['LGD Floor — Senior Unsecured',        '45%',              'Percent',       new Date('2026-01-01'), 'CRC-2026-01',  'F-IRB LGD for unsecured senior corporate per Basel'],
  ['Asset Correlation — Corporate',       '12%–24%',          'Range',         new Date('2026-01-01'), 'CRC-2026-01',  'Basel III supervisory formula; higher for low-PD obligors'],
  ['Concentration Threshold',             '5%',               'Percent',       new Date('2026-06-01'), 'CRC-2026-12',  'Sector concentration >5% of total EAD triggers capital add-on'],
  ['High Utilisation Threshold',          '80%',              'Percent',       new Date('2026-01-01'), 'CRC-2026-01',  'Exposures >80% of limit trigger enhanced monitoring review'],
  ['Hard Limit Breach Threshold',         '100%',             'Percent',       new Date('2026-01-01'), 'CRC-2026-01',  '>100% requires immediate escalation to CRO and CFO'],
  ['Migration Model Source',              "Moody's 2023",    'N/A',           new Date('2026-07-01'), 'CRC-2026-15',  'Annual transition matrix — updated each July with Moody\'s new study'],
  ['CVA Discount Rate',                   '5.25%',            'Percent',       new Date('2026-09-01'), 'CRC-2026-18',  'Risk-free rate for CVA discounting (Fed Funds Effective Rate)'],
  ['Wrong-Way Risk Add-On',               '10%',              'Percent',       new Date('2026-01-01'), 'CRC-2026-01',  'Specific WWR surcharge per IMA guidelines EBA/GL/2020/05'],
  ['Stress PD Multiplier',                '1.5×',             'Multiplier',    new Date('2026-06-01'), 'CRC-2026-12',  'Stress scenario: PD = Base PD × 1.5 (EBA 2026 adverse scenario)'],
  ['Recovery Rate — Banks (Unsecured)',   '45%',              'Percent',       new Date('2026-01-01'), 'CRC-2026-01',  'Senior unsecured recovery for bank counterparties (Moody\'s median)'],
  ['Recovery Rate — Corporate (Secured)', '65%',              'Percent',       new Date('2026-01-01'), 'CRC-2026-01',  'Senior secured recovery for corporate counterparties'],
  ['Model Next Validation Date',          new Date('2027-03-31'), 'Date',      new Date('2026-09-01'), 'CRC-2026-18',  'Annual model validation cycle — mandatory per SR 11-7 / SS1/23'],
]

params.forEach((r, idx) => {
  const row = prmSh.addRow(r)
  if (r[1] instanceof Date) row.getCell(2).numFmt = dateFmt
  if (r[3] instanceof Date) row.getCell(4).numFmt = dateFmt
  if (idx % 2 === 0) row.eachCell(c => { c.fill = altFill })
})

// Comments on specific parameter cells
prmSh.getCell('B5').note = {
  texts: [{ font:{ size:9 }, text:'Applied to all BBB- and above names. Based on CRR III Article 160(1). Lower PD floor of 0.03% vs Basel 0.05% per EBA national discretion.' }]
}
prmSh.getCell('B12').note = {
  texts: [{ font:{ size:9 }, text:"Updated July 2026 from Moody's Annual Default Study. Previous version: Moody's 2022. Change approved under fast-track procedure due to minor revisions only." }]
}

// ─── Named ranges (must use model setter — add() has a different internal API) ──
wb.definedNames.model = [
  { name: 'CreditExposureData',  ranges: [`'Credit Exposure Register'!$A$7:$O$${DATA_END}`]     },
  { name: 'MigrationMatrix',     ranges: ["'Rating Migration Matrix'!$A$6:$J$14"]               },
  { name: 'SectorConcentration', ranges: [`'Sector Concentration'!$A$5:$G$${_SEC_END}`]         },
  { name: 'CounterpartyMaster',  ranges: ["'Counterparty Master'!$A$4:$J$24"]                   },
  { name: 'RiskModelParams',     ranges: ["'Risk Model Parameters'!$A$4:$F$22"]                 },
]

// ─── Write file ───────────────────────────────────────────────────────────────
mkdirSync(join(__dirname, '..', 'public'), { recursive: true })
await wb.xlsx.writeFile(OUT)
console.log('✓ Written:', OUT)
