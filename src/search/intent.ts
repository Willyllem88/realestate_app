import { z } from "zod";
import { aiEnabled } from "../config";
import { callGemini, parseJsonLoose } from "../normalize/ai";
import { findCityInText, knownCities } from "../normalize/heuristics";
import type { SearchFilters } from "../types";

export interface Intent {
  filters: SearchFilters;
  wantCheap: boolean;
  wantNice: boolean;
  keywords: string[];       // soft boosts (district names, "quiet", "park"...), not hard filters
  interpretedBy: "ai" | "rules";
}

const fold = (s: string) =>
  s.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/ł/g, "l");

const CHEAP = /\b(cheap|cheaper|cheapest|affordable|budget|inexpensive|bargain|good deal|tani\w*|tanio|okazj\w*|niedrog\w*)\b/;
const NICE = /\b(nice|beautiful|lovely|modern|renovated|good condition|high standard|quality|stylish|cozy|ladn\w*|nowoczesn\w*|po remoncie|wysoki standard|przytuln\w*)\b/;

/** Offline fallback: understands EN + PL phrases like "nice cheap flat 40m in Kraków, balcony". */
export function parseWithRules(message: string): Intent {
  let t = fold(message);
  const filters: SearchFilters = {};

  const city = findCityInText(message);
  if (city) filters.city = city;

  // --- area: "40m", "40 m2", "40-60 m²", "at least 50 sqm", "do 60 mkw"
  const unit = "(?:m2|m\\^2|mkw|sqm|sq\\.? ?m|metr\\w*|m)(?![a-z])";
  const range = t.match(new RegExp(`(\\d{2,3})\\s*(?:-|–|to|do)\\s*(\\d{2,3})\\s*${unit}`));
  const single = t.match(new RegExp(`(?:(min\\w*|at least|over|od|powyzej|above|max\\w*|up to|under|below|do|poniżej|poniżej)\\s*)?(\\d{2,3})\\s*${unit}`));
  let areaSpan = "";
  if (range) {
    filters.minArea = Number(range[1]);
    filters.maxArea = Number(range[2]);
    areaSpan = range[0];
  } else if (single) {
    const n = Number(single[2]);
    const mod = single[1] ?? "";
    if (/^(min|at least|over|od|powyzej|above)/.test(mod)) filters.minArea = n;
    else if (/^(max|up to|under|below|do|ponizej)/.test(mod)) filters.maxArea = n;
    else { filters.minArea = Math.round(n * 0.85); filters.maxArea = Math.round(n * 1.15); } // "40m" ≈ 34-46
    areaSpan = single[0];
  }
  if (areaSpan) t = t.replace(areaSpan, " ");

  // --- price: needs a unit (k / tys / mln / zl / pln) or to be >= 50 000
  const priceRe = /(?:(under|below|up to|max\w*|do|ponizej|budget|za|around|about|ok\.?)\s*)?(\d+(?:[.,]\d+)?)\s*(k|tys\.?|tysiecy|thousand|m|mln|million|zl|pln)?(?![a-z0-9])/g;
  for (const price of t.matchAll(priceRe)) {
    let n = parseFloat(price[2].replace(",", "."));
    const u = price[3] ?? "";
    if (/^(k|tys|tysiecy|thousand)/.test(u)) n *= 1_000;
    else if (/^(m|mln|million)/.test(u)) n *= 1_000_000;
    if (n < 50_000) continue; // "2 pokoje" etc. is not a price
    const mod = price[1] ?? "";
    if (/^(under|below|up to|max|do|ponizej|budget)/.test(mod)) filters.maxPrice = Math.round(n);
    else { filters.minPrice = Math.round(n * 0.85); filters.maxPrice = Math.round(n * 1.15); }
    break;
  }

  // --- rooms
  const rooms = t.match(/(\d)\s*[- ]?\s*(?:rooms?|bedrooms?|pokoje|pokoi|pokojow\w*|pok\b|bed\b)/);
  if (rooms) filters.rooms = Number(rooms[1]);
  else if (/studio|kawalerk/.test(t)) filters.rooms = 1;

  if (/balcon|balkon|terrace|taras|loggia/.test(t)) filters.hasBalcony = true;
  if (/elevator|\blift\b|winda|windy|z winda/.test(t)) filters.hasElevator = true;
  if (/parking|garage|garaz/.test(t)) filters.hasParking = true;

  return {
    filters,
    wantCheap: CHEAP.test(t),
    wantNice: NICE.test(t),
    keywords: [],
    interpretedBy: "rules",
  };
}

const AiSchema = z.object({
  city: z.string().nullable().optional(),
  minArea: z.number().nullable().optional(),
  maxArea: z.number().nullable().optional(),
  minPrice: z.number().nullable().optional(),
  maxPrice: z.number().nullable().optional(),
  rooms: z.number().int().nullable().optional(),
  hasElevator: z.boolean().nullable().optional(),
  hasBalcony: z.boolean().nullable().optional(),
  hasParking: z.boolean().nullable().optional(),
  wantCheap: z.boolean().optional(),
  wantNice: z.boolean().optional(),
  keywords: z.array(z.string()).max(6).optional(),
});

const SYSTEM = `You convert a vague home-search message (English or Polish) into JSON filters for a Polish flat marketplace.
Return ONLY JSON with keys: city, minArea, maxArea (m²), minPrice, maxPrice (PLN), rooms (int),
hasElevator, hasBalcony, hasParking (true only if explicitly requested), wantCheap, wantNice (booleans),
keywords (max 6 short soft preferences such as district names, "quiet", "park"; no generic words).
Rules: if the user gives one approximate size like "40m", use roughly ±15% as minArea/maxArea.
Subjective words are NOT filters: "cheap" => wantCheap, "nice/modern/good" => wantNice.
Use null for anything not stated. Never invent constraints.`;

export async function parseIntent(message: string): Promise<Intent> {
  const rules = parseWithRules(message);
  if (!aiEnabled()) return rules;
  const parsed = AiSchema.safeParse(parseJsonLoose(await callGemini(SYSTEM, message, 400)));
  if (!parsed.success) return rules;
  const a = parsed.data;
  const city = a.city ? findCityInText(a.city) ?? undefined : undefined;
  const filters: SearchFilters = {};
  if (city ?? rules.filters.city) filters.city = city ?? rules.filters.city;
  for (const k of ["minArea", "maxArea", "minPrice", "maxPrice", "rooms"] as const) {
    const v = a[k] ?? rules.filters[k];
    if (v != null) filters[k] = v as never;
  }
  for (const k of ["hasElevator", "hasBalcony", "hasParking"] as const) {
    if (a[k] === true || rules.filters[k]) filters[k] = true;
  }
  return {
    filters,
    wantCheap: a.wantCheap ?? rules.wantCheap,
    wantNice: a.wantNice ?? rules.wantNice,
    keywords: (a.keywords ?? []).map((k) => k.trim()).filter(Boolean),
    interpretedBy: "ai",
  };
}

export function describeIntent(i: Intent): string {
  const p: string[] = [];
  const f = i.filters;
  if (f.city) p.push(f.city);
  if (f.minArea || f.maxArea) p.push(`${f.minArea ?? "…"}–${f.maxArea ?? "…"} m²`);
  if (f.minPrice || f.maxPrice) p.push(`${f.minPrice ? f.minPrice.toLocaleString("pl-PL") : "…"}–${f.maxPrice ? f.maxPrice.toLocaleString("pl-PL") : "…"} PLN`);
  if (f.rooms) p.push(`${f.rooms} room${f.rooms > 1 ? "s" : ""}`);
  if (f.hasBalcony) p.push("balcony");
  if (f.hasElevator) p.push("elevator");
  if (f.hasParking) p.push("parking");
  const rank = [i.wantCheap && "low price per m²", i.wantNice && "condition & completeness"].filter(Boolean);
  if (rank.length) p.push(`ranked by ${rank.join(" + ")}`);
  if (i.keywords.length) p.push(`prefers: ${i.keywords.join(", ")}`);
  return p.length ? p.join(" · ") : "no specific filters understood: showing best-quality offers";
}

export { knownCities };
