import type { ResultSetHeader, RowDataPacket } from "mysql2";
import { pool } from "../db/pool";
import type { Listing, SearchFilters } from "../types";

/** Insert or update by (source, source_id), then mark duplicates across sources. */
export async function upsertListing(l: Listing, raw: unknown): Promise<number> {
  const [res] = await pool.query<ResultSetHeader>(
    `INSERT INTO listings
      (source, source_id, url, title, description, summary, price, area_m2, price_per_m2, rooms,
       floor, total_floors, year_built, market, condition_state, has_elevator, has_balcony, has_parking,
       city, district, street, lat, lng, images, quality_score, content_hash, extraction, raw)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
     ON DUPLICATE KEY UPDATE
       url=VALUES(url), title=VALUES(title), description=VALUES(description), summary=VALUES(summary),
       price=VALUES(price), area_m2=VALUES(area_m2), price_per_m2=VALUES(price_per_m2), rooms=VALUES(rooms),
       floor=VALUES(floor), total_floors=VALUES(total_floors), year_built=VALUES(year_built),
       market=VALUES(market), condition_state=VALUES(condition_state),
       has_elevator=VALUES(has_elevator), has_balcony=VALUES(has_balcony), has_parking=VALUES(has_parking),
       city=VALUES(city), district=VALUES(district), street=VALUES(street), lat=VALUES(lat), lng=VALUES(lng),
       images=VALUES(images), quality_score=VALUES(quality_score), content_hash=VALUES(content_hash),
       extraction=VALUES(extraction), raw=VALUES(raw), id=LAST_INSERT_ID(id)`,
    [
      l.source, l.sourceId, l.url, l.title, l.description, l.summary, l.price, l.areaM2, l.pricePerM2, l.rooms,
      l.floor, l.totalFloors, l.yearBuilt, l.market, l.conditionState,
      l.hasElevator, l.hasBalcony, l.hasParking,
      l.city, l.district, l.street, l.lat, l.lng, JSON.stringify(l.images), l.qualityScore, l.contentHash,
      l.extraction, JSON.stringify(raw ?? null),
    ]
  );
  const id = res.insertId;

  // duplicate detection: the oldest row with the same fingerprint is canonical
  const [rows] = await pool.query<RowDataPacket[]>(
    "SELECT MIN(id) AS canonical FROM listings WHERE content_hash = ?", [l.contentHash]
  );
  const canonical = rows[0]?.canonical as number | null;
  await pool.query("UPDATE listings SET duplicate_of = ? WHERE id = ?", [
    canonical && canonical !== id ? canonical : null, id,
  ]);
  return id;
}

const tinyToBool = (v: unknown) => (v === null || v === undefined ? null : Number(v) === 1);

function mapRow(r: RowDataPacket) {
  let images: string[] = [];
  try { images = typeof r.images === "string" ? JSON.parse(r.images) : r.images ?? []; } catch { /* ignore */ }
  return {
    id: r.id as number,
    source: r.source as string,
    url: r.url as string | null,
    title: r.title as string,
    description: r.description as string | null,
    summary: r.summary as string | null,
    price: r.price as number | null,
    areaM2: r.area_m2 as number | null,
    pricePerM2: r.price_per_m2 as number | null,
    rooms: r.rooms as number | null,
    floor: r.floor as number | null,
    totalFloors: r.total_floors as number | null,
    yearBuilt: r.year_built as number | null,
    market: r.market as string | null,
    conditionState: r.condition_state as string | null,
    hasElevator: tinyToBool(r.has_elevator),
    hasBalcony: tinyToBool(r.has_balcony),
    hasParking: tinyToBool(r.has_parking),
    city: r.city as string | null,
    district: r.district as string | null,
    street: r.street as string | null,
    lat: r.lat as number | null,
    lng: r.lng as number | null,
    images,
    qualityScore: r.quality_score as number,
    extraction: r.extraction as string,
    createdAt: r.created_at as Date,
  };
}
export type ListingRow = ReturnType<typeof mapRow>;

function buildWhere(f: SearchFilters) {
  const where: string[] = ["duplicate_of IS NULL"];
  const params: unknown[] = [];
  if (f.city) { where.push("city = ?"); params.push(f.city); }
  if (f.minArea != null) { where.push("area_m2 >= ?"); params.push(f.minArea); }
  if (f.maxArea != null) { where.push("area_m2 <= ?"); params.push(f.maxArea); }
  if (f.minPrice != null) { where.push("price >= ?"); params.push(f.minPrice); }
  if (f.maxPrice != null) { where.push("price <= ?"); params.push(f.maxPrice); }
  if (f.rooms != null) { where.push(f.rooms >= 4 ? "rooms >= 4" : "rooms = ?"); if (f.rooms < 4) params.push(f.rooms); }
  if (f.hasElevator) where.push("has_elevator = 1");
  if (f.hasBalcony) where.push("has_balcony = 1");
  if (f.hasParking) where.push("has_parking = 1");
  if (f.q) {
    // every word must appear somewhere in title/description/location (collation is accent-insensitive)
    for (const tok of f.q.split(/\s+/).filter((t) => t.length >= 2).slice(0, 8)) {
      where.push("CONCAT_WS(' ', title, description, city, district, street) LIKE ?");
      params.push(`%${tok.replace(/[%_]/g, "")}%`);
    }
  }
  return { sql: where.join(" AND "), params };
}

const ORDER: Record<string, string> = {
  newest: "id DESC",
  price_asc: "price IS NULL, price ASC",
  price_desc: "price DESC",
  ppm_asc: "price_per_m2 IS NULL, price_per_m2 ASC",
  area_desc: "area_m2 DESC",
  best: "quality_score DESC, id DESC",
};

export async function searchListings(f: SearchFilters) {
  const page = Math.max(1, f.page ?? 1);
  const pageSize = Math.min(48, Math.max(1, f.pageSize ?? 12));
  const { sql, params } = buildWhere(f);
  const order = ORDER[f.sort ?? "best"] ?? ORDER.best;

  const [[{ total }]] = (await pool.query<RowDataPacket[]>(
    `SELECT COUNT(*) AS total FROM listings WHERE ${sql}`, params
  )) as unknown as [[{ total: number }]];
  const [rows] = await pool.query<RowDataPacket[]>(
    `SELECT * FROM listings WHERE ${sql} ORDER BY ${order} LIMIT ? OFFSET ?`,
    [...params, pageSize, (page - 1) * pageSize]
  );
  return {
    items: rows.map(mapRow).map(({ description, ...rest }) => rest), // no full text in list view
    total, page, pageSize, totalPages: Math.max(1, Math.ceil(total / pageSize)),
  };
}

/** Wider candidate set (no pagination) used by the chat ranking. */
export async function candidates(f: SearchFilters, limit = 300): Promise<ListingRow[]> {
  const { sql, params } = buildWhere(f);
  const [rows] = await pool.query<RowDataPacket[]>(
    `SELECT * FROM listings WHERE ${sql} LIMIT ?`, [...params, limit]
  );
  return rows.map(mapRow);
}

export async function getListing(id: number) {
  const [rows] = await pool.query<RowDataPacket[]>("SELECT * FROM listings WHERE id = ?", [id]);
  if (!rows[0]) return null;
  const item = mapRow(rows[0]);
  // similar offers: same city, close area, canonical only
  const [sim] = await pool.query<RowDataPacket[]>(
    `SELECT * FROM listings
     WHERE id <> ? AND duplicate_of IS NULL AND city <=> ? AND area_m2 BETWEEN ? AND ?
     ORDER BY ABS(CAST(price_per_m2 AS SIGNED) - ?) LIMIT 4`,
    [id, item.city, (item.areaM2 ?? 0) * 0.75, (item.areaM2 ?? 0) * 1.25 + 0.01, item.pricePerM2 ?? 0]
  );
  const [dups] = await pool.query<RowDataPacket[]>(
    "SELECT id, source, url FROM listings WHERE duplicate_of = ?", [id]
  );
  return {
    ...item,
    similar: sim.map(mapRow).map(({ description, ...r }) => r),
    duplicates: dups as unknown as { id: number; source: string; url: string | null }[],
  };
}

export async function facets() {
  const [cities] = await pool.query<RowDataPacket[]>(
    "SELECT city, COUNT(*) AS n FROM listings WHERE duplicate_of IS NULL AND city IS NOT NULL GROUP BY city ORDER BY n DESC"
  );
  const [stats] = await pool.query<RowDataPacket[]>(
    `SELECT COUNT(*) AS total, MIN(area_m2) AS minArea, MAX(area_m2) AS maxArea,
            MIN(price) AS minPrice, MAX(price) AS maxPrice
     FROM listings WHERE duplicate_of IS NULL`
  );
  return { cities: cities as unknown as { city: string; n: number }[], stats: stats[0] };
}
