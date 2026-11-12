import crypto from "node:crypto";
import type { Listing, RawListing } from "../types";
import { extractWithAI } from "./ai";
import {
  canonicalCity, extractFacts, heuristicSummary, stripHtml, toNumber,
} from "./heuristics";

const within = (n: number | null, min: number, max: number) =>
  n !== null && n >= min && n <= max ? n : null;

const clean = (s: string | null | undefined) => {
  const t = (s ?? "").replace(/\s+/g, " ").trim();
  return t || null;
};

/** Raw, messy marketplace data -> clean typed Listing. Unknown stays null (never 0 / false by default). */
export async function normalize(raw: RawListing, opts: { useAI?: boolean } = {}): Promise<Listing> {
  const title = clean(raw.title) ?? "Untitled listing";
  const description = stripHtml(raw.description) || null;
  const text = `${title}\n${description ?? ""}`;

  // 1) structured fields from the source: trusted but sanity-checked
  let price = toNumber(raw.price);
  price = price !== null && price >= 30_000 && price <= 100_000_000 ? Math.round(price) : null; // "ask for price" => null
  const areaM2 = within(toNumber(raw.area), 10, 500);
  const rooms = within(toNumber(raw.rooms), 1, 10);

  // 2) fields hidden in free text: rules first, AI (if enabled) refines
  const facts = extractFacts(text);
  const ai = opts.useAI && description ? await extractWithAI(title, description) : null;
  const pick = <T>(structured: unknown, aiVal: T | null | undefined, ruleVal: T | null): T | null =>
    (structured as T) ?? aiVal ?? ruleVal;

  const floor = within(toNumber(raw.floor) ?? ai?.floor ?? facts.floor, -1, 60);
  const totalFloors = within(toNumber(raw.totalFloors) ?? ai?.totalFloors ?? facts.totalFloors, 1, 70);
  const yearBuilt = within(toNumber(raw.yearBuilt) ?? ai?.yearBuilt ?? facts.yearBuilt, 1800, new Date().getFullYear() + 5);
  const marketRaw = (raw.market ?? "").toLowerCase();
  const market =
    marketRaw.includes("prim") || marketRaw.includes("pierw") ? "primary"
    : marketRaw.includes("sec") || marketRaw.includes("wtór") ? "secondary"
    : (ai?.market ?? facts.market);

  const hasElevator = pick<boolean>(null, ai?.hasElevator, facts.hasElevator);
  const hasBalcony = pick<boolean>(null, ai?.hasBalcony, facts.hasBalcony);
  const hasParking = pick<boolean>(null, ai?.hasParking, facts.hasParking);
  const conditionState = ai?.conditionState ?? facts.conditionState;

  const pricePerM2 = price && areaM2 ? Math.round(price / areaM2) : null;
  const city = canonicalCity(raw.city);
  const summary = ai?.summary ?? (description ? heuristicSummary(description) : null);
  const images = (raw.images ?? []).filter((u) => /^https?:\/\//.test(u)).slice(0, 12);

  const listing: Listing = {
    source: raw.source,
    sourceId: String(raw.sourceId),
    url: raw.url ?? null,
    title: title.slice(0, 250),
    description,
    summary,
    price, areaM2, pricePerM2, rooms,
    floor, totalFloors, yearBuilt,
    market, conditionState,
    hasElevator, hasBalcony, hasParking,
    city,
    district: clean(raw.district),
    street: clean(raw.street),
    lat: raw.lat ?? null,
    lng: raw.lng ?? null,
    images,
    qualityScore: 0,
    contentHash: "",
    extraction: ai ? "ai" : "rules",
  };
  listing.qualityScore = qualityScore(listing);
  listing.contentHash = contentHash(listing);
  return listing;
}

/** 0-100: how complete and trustworthy the offer is. Used for the "best" ranking and shown in the UI. */
export function qualityScore(l: Listing): number {
  let s = 0;
  if (l.price) s += 20;
  if (l.areaM2) s += 15;
  if (l.city) s += 10;
  if (l.district || l.street) s += 5;
  if (l.rooms) s += 5;
  if (l.floor !== null) s += 5;
  if (l.lat && l.lng) s += 5;
  const len = l.description?.length ?? 0;
  s += len >= 300 ? 15 : len >= 100 ? 8 : 0;
  s += l.images.length >= 5 ? 10 : l.images.length >= 1 ? 5 : 0;
  const known = [l.hasElevator, l.hasBalcony, l.hasParking, l.conditionState, l.yearBuilt].filter(
    (v) => v !== null
  ).length;
  s += Math.min(10, known * 2);
  // implausible price per m² in Poland (typo, rent instead of sale, bundle of flats...)
  if (l.pricePerM2 && (l.pricePerM2 < 2500 || l.pricePerM2 > 45000)) s -= 25;
  return Math.max(0, Math.min(100, s));
}

/** Same city + ~same area/rooms/price/floor/street => likely the same flat posted twice. */
export function contentHash(l: Listing): string {
  const key = [
    (l.city ?? "").toLowerCase(),
    l.areaM2 ? Math.round(l.areaM2) : "",
    l.rooms ?? "",
    l.price ? Math.round(l.price / 10_000) : "",
    l.floor ?? "",
    (l.street ?? "").toLowerCase().replace(/[^a-z0-9ąćęłńóśźż]/g, ""),
  ].join("|");
  return crypto.createHash("sha1").update(key).digest("hex");
}
