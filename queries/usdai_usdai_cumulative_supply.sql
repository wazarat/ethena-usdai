-- USDai cumulative daily supply, wrapping Dune query 4895217 (USD.AI: USDai Supply).
-- The source query returns raw mint/burn events (block_time, action, amount).
-- To use: fork query 4895217, then replace its body inside the events CTE below.
-- Run `SELECT DISTINCT action FROM ...` first to confirm the action values match.
--
-- Note: the `query_4895217` reference below uses Dune's "query of query" feature.
-- If that reference is not available on the Free plan, paste the forked query's
-- SELECT body directly into the events CTE (exposing block_time, action, amount).
WITH events AS (
  -- <<< paste the SELECT body of query 4895217 here, exposing block_time, action, amount >>>
  SELECT block_time, action, amount FROM query_4895217
),
daily AS (
  SELECT
    date_trunc('day', block_time) AS day,
    SUM(CASE WHEN action = 'mint' THEN amount
             WHEN action = 'burn' THEN -amount
             ELSE 0 END) AS net_change
  FROM events
  GROUP BY 1
)
SELECT
  day,
  SUM(net_change) OVER (ORDER BY day) AS supply
FROM daily
ORDER BY day
