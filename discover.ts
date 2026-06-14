/**
 * discover.ts — Dune API helpers + query/column verification (Free-plan safe).
 *
 * Uses ONLY the latest-results endpoint (no execution credits, no paid calls).
 * Never creates queries/dashboards. Never logs the API key.
 *
 * Can be run standalone: `npx tsx discover.ts` (verifies whatever query IDs are
 * present in .env), or imported by build.ts for the full flow.
 */

const DUNE_API_BASE = "https://api.dune.com/api/v1";

export interface VerifyResult {
  label: string;
  queryId: string;
  ok: boolean;
  dateColumn?: string;
  valueColumn?: string;
  rowCount: number;
  sample: Record<string, unknown>[];
  error?: string;
}

/** Read the rotated Dune API key from the environment, failing loudly if absent. */
export function getApiKey(): string {
  const key = process.env.DUNE_API_KEY;
  if (!key || key.trim() === "") {
    throw new Error(
      "DUNE_API_KEY is not set. Copy .env.example to .env and add your ROTATED key.",
    );
  }
  return key.trim();
}

/**
 * Fetch the latest results for a saved query. This is the only read path used
 * and it does NOT consume execution credits on the Free plan.
 */
export async function fetchLatestResults(
  queryId: string,
  limit = 5,
): Promise<{ rows: Record<string, unknown>[] }> {
  const apiKey = getApiKey();
  const url = `${DUNE_API_BASE}/query/${encodeURIComponent(queryId)}/results?limit=${limit}`;
  const res = await fetch(url, { headers: { "X-Dune-API-Key": apiKey } });

  if (!res.ok) {
    let detail = "";
    try {
      detail = JSON.stringify(await res.json());
    } catch {
      detail = await res.text().catch(() => "");
    }
    throw new Error(`HTTP ${res.status} ${res.statusText}${detail ? ` — ${detail}` : ""}`);
  }

  const json = (await res.json()) as { result?: { rows?: Record<string, unknown>[] } };
  return { rows: json.result?.rows ?? [] };
}

const DATE_NAME_RE = /(date|day|time|timestamp|^ts$|_ts$|week|month|period|block_time)/i;
const VALUE_NAME_RE = /(supply|amount|value|total|balance|usd|tvl|mcap|market_cap|circulating)/i;

function looksLikeDate(v: unknown): boolean {
  if (v instanceof Date) return true;
  if (typeof v === "number") return false; // avoid treating plain numbers as dates
  if (typeof v !== "string") return false;
  // ISO-ish date or datetime
  if (/^\d{4}-\d{2}-\d{2}([ T]\d{2}:\d{2})?/.test(v)) return true;
  const t = Date.parse(v);
  return !Number.isNaN(t) && /[-/:]/.test(v);
}

function isNumeric(v: unknown): boolean {
  if (typeof v === "number") return Number.isFinite(v);
  if (typeof v === "string" && v.trim() !== "") return Number.isFinite(Number(v));
  return false;
}

/**
 * Inspect sample rows and detect the most likely date column and numeric value
 * column. Prefers columns whose NAME matches known patterns, then falls back to
 * detection by value type.
 */
export function detectColumns(rows: Record<string, unknown>[]): {
  dateColumn?: string;
  valueColumn?: string;
} {
  if (rows.length === 0) return {};
  const keys = Object.keys(rows[0]);
  const sample = rows[0];

  // Date column: name match first, then value-shape match.
  let dateColumn = keys.find((k) => DATE_NAME_RE.test(k) && looksLikeDate(sample[k]));
  if (!dateColumn) dateColumn = keys.find((k) => looksLikeDate(sample[k]));

  // Value column: name match (and numeric) first, then any numeric that isn't the date col.
  let valueColumn = keys.find(
    (k) => k !== dateColumn && VALUE_NAME_RE.test(k) && isNumeric(sample[k]),
  );
  if (!valueColumn) valueColumn = keys.find((k) => k !== dateColumn && isNumeric(sample[k]));

  return { dateColumn, valueColumn };
}

/** Verify a single supply-style query: it runs and exposes a date + numeric column. */
export async function verifyQuery(label: string, queryId: string): Promise<VerifyResult> {
  try {
    const { rows } = await fetchLatestResults(queryId, 5);
    if (rows.length === 0) {
      return {
        label,
        queryId,
        ok: false,
        rowCount: 0,
        sample: [],
        error: "Query ran but returned 0 rows.",
      };
    }
    const { dateColumn, valueColumn } = detectColumns(rows);
    const ok = Boolean(dateColumn && valueColumn);
    return {
      label,
      queryId,
      ok,
      dateColumn,
      valueColumn,
      rowCount: rows.length,
      sample: rows.slice(0, 3),
      error: ok
        ? undefined
        : "Could not detect both a date column and a numeric value column.",
    };
  } catch (err) {
    return {
      label,
      queryId,
      ok: false,
      rowCount: 0,
      sample: [],
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

/** Print a compact, human-readable verification report for one query. */
export function printVerifyResult(r: VerifyResult): void {
  const status = r.ok ? "✅ runs" : "❌ failed";
  console.log(`\n[${r.label}] query ${r.queryId}: ${status}`);
  if (r.error) console.log(`  reason: ${r.error}`);
  if (r.dateColumn) console.log(`  date column:  ${r.dateColumn}`);
  if (r.valueColumn) console.log(`  value column: ${r.valueColumn}`);
  if (r.sample.length > 0) {
    console.log("  sample rows:");
    for (const row of r.sample) console.log(`    ${JSON.stringify(row)}`);
  }
}

/** Standalone entrypoint: verify whatever IDs are present in the environment. */
async function main(): Promise<void> {
  // Node >= 20.12 loads .env without extra deps.
  try {
    process.loadEnvFile?.();
  } catch {
    /* .env optional when vars are already exported */
  }

  const targets: { label: string; id?: string }[] = [
    { label: "ethena sUSDe supply", id: process.env.ETHENA_SUPPLY_QUERY_ID },
    { label: "USD.AI sUSDai supply", id: process.env.USDAI_SUPPLY_QUERY_ID },
    { label: "agent verdicts", id: process.env.VERDICTS_QUERY_ID },
  ];

  let any = false;
  for (const t of targets) {
    if (!t.id) continue;
    any = true;
    printVerifyResult(await verifyQuery(t.label, t.id));
  }
  if (!any) {
    console.log(
      "No query IDs found in env. Set ETHENA_SUPPLY_QUERY_ID / USDAI_SUPPLY_QUERY_ID / VERDICTS_QUERY_ID, or run `npx tsx build.ts` for the guided flow.",
    );
  }
}

// Run main() only when executed directly, not when imported by build.ts.
if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((e) => {
    console.error(`\nFatal: ${e instanceof Error ? e.message : String(e)}`);
    process.exit(1);
  });
}
