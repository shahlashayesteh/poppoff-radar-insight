## Plan

1. **Stop the AI from owning numbers**
   - Change `server_coaching` so it builds the exact percentage strings from database rows and validates the AI output before saving.
   - If the AI rewrites, rounds, or invents a percentage, replace the tip with a deterministic app-generated tip using the real stored values.

2. **Use one shared stat parser for all coaching paths**
   - Add/centralize helpers in `supabase/functions/ai-assist/index.ts` to:
     - read dynamic category stats from `server_category_stats` when real rows exist,
     - otherwise fall back to generated `server_stats.*_conversion` values,
     - format percentages consistently from the stored numeric value, without manual edits.
   - This will cover every server account, not just Chloe.

3. **Fix “what to push” priority percentages**
   - Update `generate_priorities` so weak categories are calculated from the actual uploaded week’s stats and actual targets.
   - Include dynamic category stats where available, and legacy six-column stats where not.
   - Stop rounding team gap percentages to whole numbers in the data sent to the AI.

4. **Fix menu-pairing focus percentages**
   - Keep `/server/menu` choosing focus pairings from the server’s real weakest categories.
   - Align its category ranking logic with the same source-of-truth rules as coaching: dynamic stats first only when they exist for that week, otherwise legacy generated conversions.

5. **Clear only stale generated coaching, not stats**
   - Delete cached `server_coaching` rows so insights regenerate with the corrected parser.
   - Do not manually change server stats, weekly priority values, menu pairings, or percentages.

6. **Deploy and verify with real data**
   - Deploy the updated `ai-assist` function.
   - Verify against Chloe and a sample of other server accounts that displayed coaching percentages match the database-generated weekly stats exactly, e.g. Chloe dessert remains parsed from `160 / 1874 * 100 = 8.537886...`, formatted consistently by the app rather than manually changed.