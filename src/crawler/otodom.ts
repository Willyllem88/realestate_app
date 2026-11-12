import type { RawListing } from "../types";

/**
 * Otodom is a Next.js app: every page embeds its data as JSON in <script id="__NEXT_DATA__">.
 * Reading that JSON is far more stable than scraping CSS selectors, and keeps parsing simple.
 *
 * NOTE: field names below follow Otodom's payload as of writing. The code is deliberately
 * defensive (deep search for keys, every field optional) because the payload can change.
 * If it does, `npm run crawl` prints what it could not read, and `npm run seed` still works.
 */

const BASE = "https://www.otodom.pl";
const HEADERS = {
  "user-agent": "Mozilla/5.0 (compatible; recruitment-task-bot/0.1; +educational-use)",
  "accept-language": "pl-PL,pl;q=0.9,en;q=0.5",
  accept: "text/html,application/xhtml+xml",
};
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function fetchHtml(url: string): Promise<string> {
  const res = await fetch(url, { headers: HEADERS });
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
  return res.text();
}

function nextData(html: string): any | null {
  const m = html.match(/<script id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/);
  if (!m) return null;
  try { return JSON.parse(m[1]); } catch { return null; }
}

/** Depth-first search for the first value stored under `key` that satisfies `pred`. */
function deepFind(obj: any, key: string, pred: (v: any) => boolean = () => true, depth = 0): any {
  if (!obj || typeof obj !== "object" || depth > 12) return undefined;
  if (key in obj && pred(obj[key])) return obj[key];
  for (const v of Object.values(obj)) {
    const hit = deepFind(v, key, pred, depth + 1);
    if (hit !== undefined) return hit;
  }
  return undefined;
}

const ROOMS: Record<string, number> = {
  ONE: 1, TWO: 2, THREE: 3, FOUR: 4, FIVE: 5, SIX: 6, SEVEN: 7, EIGHT: 8, NINE: 9, TEN: 10, MORE: 10,
};
const FLOORS: Record<string, number> = {
  CELLAR: -1, GROUND: 0, FIRST: 1, SECOND: 2, THIRD: 3, FOURTH: 4, FIFTH: 5, SIXTH: 6,
  SEVENTH: 7, EIGHTH: 8, NINTH: 9, TENTH: 10, ABOVE_TENTH: 11,
};

function adsFromSearchPage(data: any): any[] {
  // the list of offers is an array of objects that have both "slug" and "totalPrice"
  const items = deepFind(
    data, "items",
    (v) => Array.isArray(v) && v.length > 0 && typeof v[0] === "object" && ("slug" in v[0]) && ("totalPrice" in v[0])
  );
  return Array.isArray(items) ? items : [];
}

function mapSearchItem(it: any): RawListing {
  const addr = it.location?.address ?? {};
  const images: string[] = (it.images ?? [])
    .map((i: any) => i?.large ?? i?.medium ?? i?.small)
    .filter(Boolean);
  return {
    source: "otodom",
    sourceId: String(it.id),
    url: it.slug ? `${BASE}/pl/oferta/${it.slug}` : undefined,
    title: it.title,
    price: it.totalPrice?.value ?? null,
    area: it.areaInSquareMeters ?? null,
    rooms: ROOMS[it.roomsNumber] ?? null,
    floor: FLOORS[it.floorNumber] ?? null,
    city: addr.city?.name ?? null,
    district: addr.district?.name ?? addr.neighborhood?.name ?? null,
    street: addr.street?.name ?? null,
    images,
    extras: { estate: it.estate, transaction: it.transaction, agency: it.agency?.name },
  };
}

/** Second request per offer: full description + characteristics + coordinates. */
async function enrichFromDetails(base: RawListing): Promise<RawListing> {
  if (!base.url) return base;
  try {
    const data = nextData(await fetchHtml(base.url));
    const ad = data?.props?.pageProps?.ad;
    if (!ad) return base;
    const chars: { key: string; value: string }[] = ad.characteristics ?? [];
    const ch = (k: string) => chars.find((c) => c.key === k)?.value;
    const floorKey = ch("floor_no"); // e.g. "floor_3", "ground_floor"
    return {
      ...base,
      description: ad.description ?? base.description,
      totalFloors: ch("building_floors_num") ?? undefined,
      yearBuilt: ch("build_year") ?? undefined,
      market: ch("market") ?? undefined,
      floor: base.floor ?? (floorKey?.match(/(\d+)/) ? Number(floorKey.match(/(\d+)/)![1]) : floorKey?.includes("ground") ? 0 : undefined),
      lat: ad.location?.coordinates?.latitude ?? undefined,
      lng: ad.location?.coordinates?.longitude ?? undefined,
      images: (ad.images ?? []).map((i: any) => i?.large ?? i?.medium).filter(Boolean).length
        ? (ad.images ?? []).map((i: any) => i?.large ?? i?.medium).filter(Boolean)
        : base.images,
      extras: { ...base.extras, characteristics: chars },
    };
  } catch (e: any) {
    console.warn(`  ! details failed (${e.message}); keeping list data only`);
    return base;
  }
}

export async function crawlOtodom(target: number, log = console.log): Promise<RawListing[]> {
  const seen = new Set<string>();
  const out: RawListing[] = [];
  // random-ish sample: several pages with different sort orders across Poland
  const sorts = ["DEFAULT", "PRICE_ASC", "DATE_DESC"];
  for (const sort of sorts) {
    for (let page = 1; page <= 6 && out.length < target; page++) {
      const url = `${BASE}/pl/wyniki/sprzedaz/mieszkanie/cala-polska?limit=36&page=${page}&by=${sort}&direction=${sort === "PRICE_ASC" ? "ASC" : "DESC"}`;
      log(`→ list ${sort} p${page}`);
      let data: any;
      try { data = nextData(await fetchHtml(url)); } catch (e: any) { log(`  ! ${e.message}`); continue; }
      const ads = adsFromSearchPage(data);
      if (!ads.length) { log("  ! no offers found in payload (layout changed or blocked?)"); continue; }
      for (const ad of ads) {
        const raw = mapSearchItem(ad);
        if (seen.has(raw.sourceId)) continue;
        seen.add(raw.sourceId);
        out.push(raw);
      }
      await sleep(800);
    }
    if (out.length >= target) break;
  }
  // shuffle, cut to target, then fetch details politely
  out.sort(() => Math.random() - 0.5);
  const picked = out.slice(0, target);
  const full: RawListing[] = [];
  for (const [i, raw] of picked.entries()) {
    if ((i + 1) % 10 === 0) log(`→ details ${i + 1}/${picked.length}`);
    full.push(await enrichFromDetails(raw));
    await sleep(600);
  }
  return full;
}
