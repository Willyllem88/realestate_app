# Reasoning (draft, edit with your own voice before submitting)

**Scope.** A small pipeline: *fetch → normalise → MySQL → search → offer page*, plus an optional "describe what you want" box. It runs fully offline (rule-based); an API key only upgrades two steps.

**What I extract, and why.** Only what a buyer filters or judges on: price, area, rooms, floor/total floors, year, market, condition, elevator/balcony/parking, city/district/street, coordinates, photos, description. I derive `price_per_m2` (the one number that makes offers comparable) and a `quality_score`. The original payload is kept in a `raw` JSON column so I can re-process without re-crawling.

**Low-quality data.** (1) Every field is sanity-checked (area 10–500 m², price ≥ 30 000 zł; a price of 4 800 zł is a typo or "ask for price", so it becomes `NULL`). (2) *Unknown ≠ false:* `has_elevator` is `NULL` unless the text says so; "bez windy" gives `false`. The UI shows "Not specified" instead of "No". (3) Cities are canonicalised ("krakow" → "Kraków"). (4) HTML is stripped from descriptions. (5) Duplicates are detected by a fingerprint (city + rounded area, rooms, price, floor, street) and hidden behind the oldest offer. (6) `quality_score` penalises missing fields and implausible price/m².

**Where AI is used (and where it isn't).** Two places, both optional and both with a deterministic fallback:

1. *Extraction:* Polish descriptions → floor, year, condition, amenities (with negation) + a 2-sentence English summary.
   Output is validated with zod; the model never overwrites structured fields from the source.
2. *Query understanding:* "nice, cheap, 40m in Kraków" → filters + `wantCheap/wantNice`. The LLM only parses intent.
   **Ranking is plain code** (cheap = price/m² vs the median of matching offers; nice = condition + completeness +
   amenities), so results are explainable: each card says *why* it was ranked.
I did not use AI for search itself or dedup: SQL + a hash are cheaper, faster and debuggable for ~100 rows.

**Key assumption.** Buyers compare on price per m² within a city and size band, so "cheap" must be *relative to comparable offers*, not an absolute price.

**Success metric.** Share of search sessions that end in a click-through to an offer page *or* "View original offer" within the session (target: > 40%), tracked separately for chat vs filter search.

**Failure mode / limitation.** Rule-based and keyword search miss intent that isn't a filter ("quiet", "near a park"): it's only a soft keyword boost. Fingerprint dedup misses near-duplicates just across a price rounding boundary. "Cheap" is computed on the *currently matching* set, so with few matches the median is unstable. The otodom crawler depends on its embedded JSON and may break; I could not verify it against the live site. Demo data (`npm run seed`) is synthetic and clearly labelled in the UI.

**With more time.** Embeddings (or MySQL FULLTEXT / OpenSearch) for semantic search; geocoding + "near X" queries; evaluation set of ~50 queries with expected results to measure the parser; price history and re-crawl scheduling (mark delisted offers); image-based dedup; tests for `normalize()` and `parseWithRules()`; a proper React frontend.

## Example scenarios

**A (filters).** Search tab → City *Kraków*, 40–80 m² → 25 offers, sort by *Price per m²* → open the first card →
see specs, "x% below similar offers", similar flats.

**B (vague intent).** "Describe what you want" → `I want a nice, cheap flat, 40m in Kraków` → interpreted as Kraków · 34–46 m² · ranked by low price/m² + condition → top results show reasons such as "8% below median price/m² of matching offers · renovated / high standard". If nothing matches, constraints are dropped one by one (amenities → rooms → price → area) and the user is told which.
