import type { ListingRow } from "../repo/listings";
import type { Intent } from "./intent";

export type Ranked = ListingRow & { score: number; reasons: string[] };

const clamp = (n: number, lo = 0, hi = 1) => Math.min(hi, Math.max(lo, n));
const plausible = (ppm: number | null) => ppm !== null && ppm >= 2500 && ppm <= 45000;

/**
 * Turns subjective words into numbers, transparently:
 *  - cheap  = price per m² relative to the median of the *matching* offers (implausible prices ignored)
 *  - nice   = condition + completeness + amenities + newer building
 * Every result carries human-readable reasons, so the UI can explain why it was ranked.
 */
export function rankListings(rows: ListingRow[], intent: Intent): Ranked[] {
  const ppms = rows.map((r) => r.pricePerM2).filter(plausible).sort((a, b) => a! - b!) as number[];
  const median = ppms.length ? ppms[Math.floor(ppms.length / 2)] : null;

  const ranked = rows.map((r) => {
    const reasons: string[] = [];
    let cheap = 0.3; // unknown / implausible price: neither rewarded nor punished much
    if (plausible(r.pricePerM2) && median) {
      cheap = clamp(0.5 + (median - r.pricePerM2!) / median);
      const diff = Math.round((1 - r.pricePerM2! / median) * 100);
      if (diff >= 5) reasons.push(`${diff}% below median price/m² of matching offers`);
      else if (diff <= -10) reasons.push(`${-diff}% above median price/m²`);
    }

    let nice = 0.5 * (r.qualityScore / 100);
    if (r.conditionState === "excellent") { nice += 0.3; reasons.push("renovated / high standard"); }
    else if (r.conditionState === "good") { nice += 0.15; reasons.push("good condition"); }
    else if (r.conditionState === "to_renovate") { nice -= 0.2; reasons.push("needs renovation"); }
    if (r.hasBalcony) nice += 0.05;
    if (r.hasElevator) nice += 0.05;
    if (r.hasParking) nice += 0.05;
    if (r.yearBuilt && r.yearBuilt >= 2010) nice += 0.1;
    nice = clamp(nice);

    const hay = `${r.title} ${r.description ?? ""} ${r.district ?? ""} ${r.street ?? ""}`.toLowerCase();
    const hits = intent.keywords.filter((k) => hay.includes(k.toLowerCase()));
    if (hits.length) reasons.push(`mentions: ${hits.join(", ")}`);

    let score = 0.3 * (r.qualityScore / 100) + Math.min(0.3, hits.length * 0.1);
    if (intent.wantCheap) score += 0.5 * cheap;
    if (intent.wantNice) score += 0.5 * nice;
    if (!intent.wantCheap && !intent.wantNice) score += 0.4 * nice;
    if (r.qualityScore < 40) reasons.push("incomplete listing");

    return { ...r, score: Math.round(score * 1000) / 1000, reasons };
  });

  return ranked.sort((a, b) => b.score - a.score);
}
