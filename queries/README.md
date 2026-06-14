# queries/

These SQL files wrap the **raw USD.AI event queries** into chartable **daily cumulative supply** series.

The source queries return individual mint/burn events (columns: `block_time, blockchain, tx_hash, action, address, amount`), which charts as a meaningless scatter of transactions rather than supply over time. The wrappers turn those events into a clean two-column series: **`day`, `supply`**.

| Wrapper file                          | Source Dune query | Asset  |
| ------------------------------------- | ----------------- | ------ |
| `usdai_susdai_cumulative_supply.sql`  | 5563905           | sUSDai |
| `usdai_usdai_cumulative_supply.sql`   | 4895217           | USDai  |

## How to use

1. **Fork the source query** in Dune (5563905 for sUSDai, 4895217 for USDai).
2. **Wrap it.** Either:
   - paste the forked query's `SELECT` body directly into the `events` CTE (exposing `block_time, action, amount`), or
   - use the `query_<ID>` reference already in the file (Dune's "query of query" feature). If `query_<ID>` is not available on the Free plan, fall back to pasting the body.
3. **Verify the action values** before relying on the CASE logic: run `SELECT DISTINCT action FROM ...` and confirm they are `mint` / `burn`. Adjust the `CASE` arms if they differ.
4. **Run and save** the new wrapped query.
5. **Record the new query IDs** in `.env`:
   - sUSDai wrapper → `USDAI_SUPPLY_QUERY_ID`
   - USDai wrapper → `USDAI_SECONDARY_QUERY_ID`

The output columns (`day`, `supply`) are picked up automatically by the date/value column detection in `discover.ts`.
