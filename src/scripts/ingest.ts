import { aiEnabled } from "../config";
import { pool } from "../db/pool";
import { normalize } from "../normalize/pipeline";
import { upsertListing } from "../repo/listings";
import type { RawListing } from "../types";

export async function ingest(raws: RawListing[], opts: { noAi?: boolean } = {}) {
  const useAI = aiEnabled() && !opts.noAi;
  console.log(`Normalising ${raws.length} offers (AI extraction: ${useAI ? "on" : "off"})…`);
  let ok = 0, failed = 0;
  for (const raw of raws) {
    try {
      const listing = await normalize(raw, { useAI });
      await upsertListing(listing, raw);
      ok++;
    } catch (e: any) {
      failed++;
      console.warn(`  ! ${raw.source}/${raw.sourceId}: ${e.message}`);
    }
  }
  const [[row]]: any = await pool.query(
    "SELECT COUNT(*) AS n, SUM(duplicate_of IS NOT NULL) AS dups, ROUND(AVG(quality_score)) AS q FROM listings"
  );
  console.log(`✔ Stored ${ok} (failed ${failed}). Table now: ${row.n} rows, ${row.dups ?? 0} flagged duplicates, avg quality ${row.q}/100.`);
  await pool.end();
}
