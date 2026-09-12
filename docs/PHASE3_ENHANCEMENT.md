# Phase 3: Self-Validation Pass

**Status:** Documented, not implemented. Candidate enhancement after Phase 1 + Phase 2 are proven in production use.

---

## Problem It Solves

After Phase 2, Claude produces a schema in one two-stage pass. For complex workbooks (e.g. multi-sheet crosstabs with hidden columns, sparse data regions, or non-standard EUC layouts), the generated schema may have:

- Incorrect data types that contradict the raw cell values
- Data ranges that miss totals rows or include metadata rows
- Nullable flags that don't match actual null frequency in the data
- Missing columns that fall outside the detected header row

Phase 3 adds a **self-validation loop** where a second Claude call reviews the generated schema against the raw data and flags or corrects inconsistencies before the schema is shown to the user.

---

## Proposed Architecture

```
Upload → Parser → Analyzer → Stage 1 (structure) → Stage 2 (schema) → Stage 3 (validate) → UI
```

### Stage 3 prompt (sketch)

```
You previously inferred this schema:
<schema JSON>

Here are the actual cell samples for each proposed column:
<column → sample values, null count, format distribution>

Validate each column:
1. Does the declared dataType match the samples?
2. Does the nullable flag match null frequency (>5% nulls → nullable)?
3. Are any columns missing from the header that appear in the data region?
4. Do the sourceRange bounds exclude totals rows?

Output a revised schema JSON with corrections applied, plus a "validationNotes" array on each changed column explaining what was corrected.
```

### New fields in `ColumnSchema`

```ts
validationNotes?: string[]   // set by Stage 3, explains auto-corrections
autoCorrections?: {          // structured diff of what changed
  field: 'dataType' | 'nullable' | 'sourceRange' | 'length'
  from: string
  to: string
  reason: string
}[]
```

---

## When to Activate

Phase 3 is expensive (a third Claude call per upload). Suggested trigger conditions:

- `workbookSummary.lowConfidenceFieldCount > 3` — many uncertain columns
- Any sheet has `tableType === 'CROSSTAB'` — complex structure
- Any column has `confidence < 0.75` — Claude itself flagged uncertainty
- File has named ranges (data boundaries are explicit — validation is cheap to verify)

These can be exposed as a user-facing toggle ("Deep validation") on the upload page.

---

## Cost / Latency Estimate

| Phase     | Calls | Approx latency | Approx cost (Opus 4.7) |
|-----------|-------|----------------|------------------------|
| Phase 2   | 2     | 20–40 s        | ~$0.05–0.15 per file   |
| Phase 3   | +1    | +15–25 s       | +$0.03–0.08 per file   |

For a PoC/demo, Phase 2 is sufficient. Phase 3 adds value for production use with large or irregular EUC files.

---

## Implementation Notes

- Reuse `buildWorkbookContext()` from `claude-provider.ts` — it already generates the per-column numFmt and sample data needed for validation.
- Add a `columnStats(sheet, col)` helper that returns `{ nullCount, sampleValues[], dominantNumFmt }` — this feeds Stage 3 without re-parsing.
- The Zod schema will need `validationNotes` and `autoCorrections` added as optional fields.
- Consider surfacing `autoCorrections` in the review UI as a diff view ("AI corrected this from X to Y").
