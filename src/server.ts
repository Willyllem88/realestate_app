import express from "express";
import path from "node:path";
import { z } from "zod";
import { aiEnabled, config } from "./config";
import { pool } from "./db/pool";
import { candidates, facets, getListing, searchListings } from "./repo/listings";
import { describeIntent, parseIntent } from "./search/intent";
import { rankListings } from "./search/rank";

const app = express();
app.use(express.json({ limit: "20kb" }));
app.use(express.static(path.join(__dirname, "..", "public")));

const num = z.coerce.number().finite().optional();
const bool = z.enum(["1", "true"]).optional().transform((v) => (v ? true : undefined));
const QuerySchema = z.object({
  q: z.string().trim().max(200).optional(),
  city: z.string().trim().max(80).optional(),
  minArea: num, maxArea: num, minPrice: num, maxPrice: num,
  rooms: num,
  hasElevator: bool, hasBalcony: bool, hasParking: bool,
  sort: z.enum(["newest", "price_asc", "price_desc", "ppm_asc", "area_desc", "best"]).optional(),
  page: num, pageSize: num,
});

app.get("/api/health", async (_req, res) => {
  try {
    await pool.query("SELECT 1");
    res.json({ ok: true, ai: aiEnabled() });
  } catch (e: any) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

app.get("/api/facets", async (_req, res, next) => {
  try { res.json(await facets()); } catch (e) { next(e); }
});

app.get("/api/listings", async (req, res, next) => {
  try {
    const parsed = QuerySchema.safeParse(req.query);
    if (!parsed.success) return res.status(400).json({ error: "Invalid query", details: parsed.error.flatten() });
    res.json(await searchListings(parsed.data));
  } catch (e) { next(e); }
});

app.get("/api/listings/:id", async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) return res.status(400).json({ error: "Invalid id" });
    const item = await getListing(id);
    if (!item) return res.status(404).json({ error: "Offer not found" });
    res.json(item);
  } catch (e) { next(e); }
});

/** "Example B": vague natural-language intent -> filters + transparent ranking. */
app.post("/api/chat", async (req, res, next) => {
  try {
    const { message } = z.object({ message: z.string().trim().min(2).max(300) }).parse(req.body);
    const intent = await parseIntent(message);
    // Progressive relaxation: if nothing matches, drop the least important constraints first
    // and tell the user exactly what was dropped (never silently).
    let filters = { ...intent.filters };
    let rows = await candidates(filters);
    const dropped: string[] = [];
    const steps: [string, (keyof typeof filters)[]][] = [
      ["amenities", ["hasBalcony", "hasElevator", "hasParking"]],
      ["rooms", ["rooms"]],
      ["price", ["minPrice", "maxPrice"]],
      ["area", ["minArea", "maxArea"]],
    ];
    for (const [label, keys] of steps) {
      if (rows.length > 0) break;
      if (!keys.some((k) => filters[k] != null)) continue;
      filters = { ...filters };
      for (const k of keys) delete filters[k];
      dropped.push(label);
      rows = await candidates(filters);
    }
    const relaxed = dropped.length > 0;
    const ranked = rankListings(rows, intent).slice(0, 12).map(({ description, ...r }) => r);
    res.json({
      interpretation: describeIntent(intent),
      interpretedBy: intent.interpretedBy,
      filters: intent.filters,
      relaxed,
      dropped,
      total: rows.length,
      items: ranked,
    });
  } catch (e) { next(e); }
});

app.use((err: any, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  if (err instanceof z.ZodError) return res.status(400).json({ error: "Invalid input", details: err.flatten() });
  console.error(err);
  res.status(500).json({ error: "Something went wrong on our side. Check the server console." });
});

app.listen(config.port, () => {
  console.log(`✔ Server running at http://localhost:${config.port}  (AI: ${aiEnabled() ? "on" : "off - rule-based fallbacks"})`);
});
