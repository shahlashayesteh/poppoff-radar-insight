# Tool 2 — Server Revenue Gap Calculator

Standalone client-side page at `/calculator/server-gap`. Files processed in browser only.

## Files created
- `src/routes/calculator.server-gap.tsx`
- `src/lib/server-gap/{identity,opportunity,parse,merge,calc,warnings,confidence}.ts`
- `public/templates/server-gap-{sales,labour}-template.csv`

## Files edited (copy-only)
- `src/routes/calculator.tsx` — footer link to Tool 2

## Protected files
None touched.

## Calculation contract
- Adjusted Hours = Hours × Opportunity Factor (inferred from actual start/end times only — never daypart labels)
- Adjusted RPH = Sales ÷ Adjusted Hours
- Server Adjusted RPH = Σ sales / Σ adjusted hours (weighted, never avg of avgs)
- Ranked ONLY by Adjusted RPH — never by raw sales or raw hours
- Ambiguous matches flagged and excluded, never guessed
