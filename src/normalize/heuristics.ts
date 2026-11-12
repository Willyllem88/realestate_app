/**
 * Deterministic, offline extraction rules for Polish real-estate text.
 * They are the baseline: the AI layer (ai.ts) is optional and falls back to these.
 */

export function toNumber(v: unknown): number | null {
  if (v === null || v === undefined || v === "") return null;
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  // "1 234 567,50 zł" / "45,6 m²" -> 1234567.5 / 45.6
  const cleaned = String(v)
    .replace(/\u00a0/g, " ")
    .replace(/[^\d,.\- ]/g, "")
    .replace(/\s+/g, "")
    .replace(",", ".");
  const n = parseFloat(cleaned);
  return Number.isFinite(n) ? n : null;
}

export function stripHtml(html: string | undefined | null): string {
  if (!html) return "";
  return html
    .replace(/<br\s*\/?>|<\/p>|<\/li>|<\/div>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/[ \t]+/g, " ")
    .replace(/\n\s*\n+/g, "\n")
    .trim();
}

const fold = (s: string) =>
  s.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/ł/g, "l");

const CITIES = [
  "Kraków", "Warszawa", "Wrocław", "Gdańsk", "Poznań", "Łódź", "Katowice",
  "Szczecin", "Lublin", "Gdynia", "Bydgoszcz", "Białystok", "Sopot", "Rzeszów",
];
const CITY_BY_FOLDED = new Map(CITIES.map((c) => [fold(c), c]));

/** "krakow", "KRAKÓW " -> "Kraków". Unknown cities are only trimmed / title-cased. */
export function canonicalCity(v: string | null | undefined): string | null {
  if (!v) return null;
  const t = v.trim();
  if (!t) return null;
  const hit = CITY_BY_FOLDED.get(fold(t));
  if (hit) return hit;
  return t.charAt(0).toUpperCase() + t.slice(1);
}

export function knownCities(): string[] {
  return CITIES;
}

/** Finds a known city mentioned anywhere in a free text (used by the chat parser too). */
export function findCityInText(text: string): string | null {
  const f = fold(text);
  for (const [folded, canon] of CITY_BY_FOLDED) {
    // match the stem so that "w krakowie", "krakowa" still hit
    const stem = folded.length > 5 ? folded.slice(0, folded.length - 1) : folded;
    if (new RegExp(`(^|[^a-z])${stem}`).test(f)) return canon;
  }
  return null;
}

export interface TextFacts {
  floor: number | null;
  totalFloors: number | null;
  yearBuilt: number | null;
  market: "primary" | "secondary" | null;
  conditionState: "to_renovate" | "good" | "excellent" | "developer_standard" | null;
  hasElevator: boolean | null;
  hasBalcony: boolean | null;
  hasParking: boolean | null;
}

/** true / false / null(unknown). Negation ("bez balkonu", "brak windy") beats mention. */
function flag(text: string, positive: RegExp, negative: RegExp): boolean | null {
  if (negative.test(text)) return false;
  if (positive.test(text)) return true;
  return null;
}

export function extractFacts(rawText: string): TextFacts {
  const t = fold(rawText);

  let floor: number | null = null;
  let totalFloors: number | null = null;
  if (/\bparter\b/.test(t)) floor = 0;
  const f1 = t.match(/(\d{1,2})\s*(?:\/|z)\s*(\d{1,2})\s*pietr/) ?? t.match(/pietro\s*:?\s*(\d{1,2})\s*(?:\/|z)\s*(\d{1,2})/);
  if (f1) {
    floor = Number(f1[1]);
    totalFloors = Number(f1[2]);
  } else {
    const f2 = t.match(/(\d{1,2})\s*(?:-?go)?\s*pietro/) ?? t.match(/pietro\s*:?\s*(\d{1,2})\b/);
    if (f2) floor = Number(f2[1]);
    const f3 = t.match(/(\d{1,2})\s*-?\s*pietrow/) ?? t.match(/(\d{1,2})\s*kondygnacj/);
    if (f3) totalFloors = Number(f3[1]);
  }

  const yb = t.match(/(?:rok budowy|zbudowan\w*|budynek z|kamienica z)\D{0,12}((?:18|19|20)\d{2})/);
  const yearBuilt = yb ? Number(yb[1]) : null;

  let market: TextFacts["market"] = null;
  if (/rynek pierwotny|od dewelopera|nowa inwestycja/.test(t)) market = "primary";
  else if (/rynek wtorny|wtorny/.test(t)) market = "secondary";

  let conditionState: TextFacts["conditionState"] = null;
  if (/do remontu|do generalnego remontu|do odswiezenia|do wykonczenia wlasnego/.test(t)) conditionState = "to_renovate";
  else if (/stan deweloperski|do wykonczenia/.test(t)) conditionState = "developer_standard";
  else if (/po remoncie|po generalnym remoncie|wysoki standard|nowoczesn\w+ wykonczen|nowe wykonczenie|luksusow/.test(t)) conditionState = "excellent";
  else if (/dobry stan|bardzo dobry stan|gotowe do zamieszkania|do zamieszkania/.test(t)) conditionState = "good";

  return {
    floor,
    totalFloors,
    yearBuilt,
    market,
    conditionState,
    hasElevator: flag(t, /\bwind[aey]\b|\bz winda\b/, /bez windy|brak windy|nie ma windy/),
    hasBalcony: flag(t, /balkon|taras|loggi/, /bez balkonu|brak balkonu|nie ma balkonu/),
    hasParking: flag(t, /garaz|miejsce postojowe|miejsce parkingowe|parking|miejsce w hali/, /bez (?:garazu|parkingu)|brak (?:garazu|parkingu|miejsca)/),
  };
}

/** Cheap summary: first sentences of the description, capped. */
export function heuristicSummary(text: string, max = 280): string | null {
  const clean = text.replace(/\s+/g, " ").trim();
  if (clean.length < 40) return null;
  const sentences = clean.split(/(?<=[.!?])\s+/);
  let out = "";
  for (const s of sentences) {
    if ((out + " " + s).trim().length > max) break;
    out = (out + " " + s).trim();
  }
  return out || clean.slice(0, max - 1) + "…";
}
