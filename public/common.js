// Shared helpers for both pages (no framework, no build step).
export const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
export const fmtPrice = (n) => (n == null ? null : new Intl.NumberFormat("pl-PL").format(n) + " zł");
export const fmtArea = (n) => (n == null ? null : String(Math.round(n * 10) / 10).replace(".", ",") + " m²");
export const roomsLabel = (n) => (n == null ? null : `${n} ${n === 1 ? "room" : "rooms"}`);
export const floorLabel = (f, t) => (f == null ? null : (f === 0 ? "Ground floor" : `Floor ${f}`) + (t ? ` of ${t}` : ""));
export const COND = { excellent: "Renovated / high standard", good: "Good condition", to_renovate: "Needs renovation", developer_standard: "Developer standard" };
export const yesNo = (v) => (v === true ? "Yes" : v === false ? "No" : null);

export async function api(path, opts) {
  const res = await fetch(path, opts);
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `Request failed (${res.status})`);
  return data;
}

const HOUSE = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true"><path d="M3 11l9-7 9 7v9a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z"/></svg>`;
export const placeholder = HOUSE;

export function card(it, { reasons = false } = {}) {
  const facts = [fmtArea(it.areaM2), roomsLabel(it.rooms), floorLabel(it.floor, it.totalFloors)].filter(Boolean).join("  ·  ");
  const loc = [it.street, it.district, it.city].filter(Boolean).join(", ");
  const tags = [];
  if (it.conditionState === "excellent") tags.push(`<span class="tag">Renovated</span>`);
  if (it.conditionState === "to_renovate") tags.push(`<span class="tag warn">Needs renovation</span>`);
  if (it.hasBalcony) tags.push(`<span class="tag">Balcony</span>`);
  if (it.hasElevator) tags.push(`<span class="tag">Elevator</span>`);
  if (it.hasParking) tags.push(`<span class="tag">Parking</span>`);
  if (it.source === "seed") tags.push(`<span class="tag warn" title="Generated demo data">Demo data</span>`);
  if (it.qualityScore < 40) tags.push(`<span class="tag bad">Incomplete</span>`);
  return `<a class="card" href="/listing.html?id=${it.id}">
    <div class="thumb">${it.images?.[0] ? `<img loading="lazy" src="${esc(it.images[0])}" alt="">` : HOUSE}</div>
    <div class="card-body">
      <div class="price num">${it.price ? fmtPrice(it.price) : `<span class="unknown" style="font:italic 16px var(--sans)">Price on request</span>`}${it.pricePerM2 ? `<small>${new Intl.NumberFormat("pl-PL").format(it.pricePerM2)} zł/m²</small>` : ""}</div>
      <div class="facts num">${esc(facts) || "<span class='unknown'>Details not provided</span>"}</div>
      <div class="loc">${esc(loc)}</div>
      <div class="title">${esc(it.title)}</div>
      ${tags.length ? `<div class="tags">${tags.join("")}</div>` : ""}
      ${reasons && it.reasons?.length ? `<div class="reasons">${it.reasons.map(esc).join("<br>")}</div>` : ""}
    </div></a>`;
}

export function skeletons(n = 6) { return Array.from({ length: n }, () => `<div class="skeleton"></div>`).join(""); }

export async function mountHeader(active) {
  let ai = false;
  try { ai = (await api("/api/health")).ai; } catch { /* ignore */ }
  document.getElementById("top").innerHTML = `<div class="top-in">
    <a class="brand" href="/">Domownik</a>
    <span class="ai-flag">${ai ? "AI search on" : "AI off · rule-based search"}</span></div>`;
}
