import { api, card, COND, esc, floorLabel, fmtArea, fmtPrice, mountHeader, placeholder, yesNo } from "./common.js";

await mountHeader();
const root = document.getElementById("root");
const id = new URLSearchParams(location.search).get("id");

function spec(label, value) {
  return `<dt>${label}</dt><dd>${value ? esc(value) : `<span class="unknown">Not specified</span>`}</dd>`;
}

try {
  const it = await api(`/api/listings/${encodeURIComponent(id)}`);
  document.title = `${it.title} · Domownik`;
  const loc = [it.street, it.district, it.city].filter(Boolean).join(", ");
  const market = it.market === "primary" ? "Primary (new)" : it.market === "secondary" ? "Secondary" : null;
  const similarMedian = it.similar.filter((s) => s.pricePerM2).map((s) => s.pricePerM2);
  const avg = similarMedian.length ? similarMedian.reduce((a, b) => a + b, 0) / similarMedian.length : null;
  const vs = avg && it.pricePerM2 ? Math.round((it.pricePerM2 / avg - 1) * 100) : null;

  root.innerHTML = `
    <a class="back" href="/">← All offers</a>
    <div class="detail">
      <div>
        <div class="hero" id="hero">${it.images[0] ? `<img src="${esc(it.images[0])}" alt="Photo of the flat">` : placeholder}</div>
        ${it.images.length > 1 ? `<div class="thumbs">${it.images.map((u, i) => `<img src="${esc(u)}" alt="Photo ${i + 1}" data-i="${i}" ${i === 0 ? 'aria-current="true"' : ""}>`).join("")}</div>` : ""}
        <h1 class="dtitle">${esc(it.title)}</h1>
        <div class="loc">${esc(loc)}</div>

        ${it.summary ? `<div class="section"><div class="summary">${esc(it.summary)}<small>${it.extraction === "ai" ? "Summary written by AI from the original description." : "Summary taken from the start of the original description."}</small></div></div>` : ""}
        <div class="section"><h2>Description</h2>
          ${it.description ? `<div class="desc">${esc(it.description)}</div>` : `<p class="unknown">The seller did not provide a description.</p>`}
        </div>
        ${it.similar.length ? `<div class="section"><h2>Similar offers</h2><div class="grid">${it.similar.map((s) => card(s)).join("")}</div></div>` : ""}
      </div>

      <aside class="panel">
        <div class="price num">${it.price ? fmtPrice(it.price) : `<span class="unknown" style="font:italic 18px var(--sans)">Price on request</span>`}</div>
        ${it.pricePerM2 ? `<div class="num" style="color:var(--muted)">${new Intl.NumberFormat("pl-PL").format(it.pricePerM2)} zł/m²${vs !== null ? ` · ${vs === 0 ? "in line with" : Math.abs(vs) + "% " + (vs < 0 ? "below" : "above")} similar offers` : ""}</div>` : ""}
        <dl class="specs num">
          ${spec("Area", fmtArea(it.areaM2))}
          ${spec("Rooms", it.rooms)}
          ${spec("Floor", floorLabel(it.floor, it.totalFloors))}
          ${spec("Built", it.yearBuilt)}
          ${spec("Market", market)}
          ${spec("Condition", COND[it.conditionState])}
          ${spec("Elevator", yesNo(it.hasElevator))}
          ${spec("Balcony / terrace", yesNo(it.hasBalcony))}
          ${spec("Parking", yesNo(it.hasParking))}
        </dl>
        <div style="margin-top:16px">
          <div style="font-size:13px;color:var(--muted)">Listing completeness: <b class="num">${it.qualityScore}/100</b></div>
          <div class="meter"><i style="width:${it.qualityScore}%"></i></div>
        </div>
        ${it.url ? `<p><a class="btn" style="display:inline-block;text-decoration:none;margin-top:14px" href="${esc(it.url)}" target="_blank" rel="noopener">View original offer</a></p>`
                 : `<p class="tag warn" style="display:inline-block;margin-top:14px">Generated demo data, no original offer</p>`}
        ${it.duplicates.length ? `<p style="font-size:13px;color:var(--muted)">Also posted ${it.duplicates.length}× elsewhere; merged into this offer.</p>` : ""}
      </aside>
    </div>`;

  document.querySelector(".thumbs")?.addEventListener("click", (e) => {
    const i = e.target.dataset?.i;
    if (i === undefined) return;
    document.querySelector("#hero img").src = it.images[i];
    document.querySelectorAll(".thumbs img").forEach((el) => el.removeAttribute("aria-current"));
    e.target.setAttribute("aria-current", "true");
  });
} catch (e) {
  root.innerHTML = `<a class="back" href="/">← All offers</a><div class="error" role="alert">${esc(e.message)}</div>`;
}
