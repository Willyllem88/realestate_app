import { api, card, esc, mountHeader, skeletons } from "./common.js";

const $ = (s) => document.querySelector(s);
const form = $("#filters");
let page = 1;

/* ---------- header with mode tabs ---------- */
await mountHeader();
$(".top-in .brand").insertAdjacentHTML("afterend",
  `<div class="tabs" role="tablist">
     <button role="tab" id="tab-search" aria-selected="true">Search</button>
     <button role="tab" id="tab-ask" aria-selected="false">Describe what you want</button>
   </div>`);
function setMode(mode) {
  const ask = mode === "ask";
  $("#view-search").hidden = ask;
  $("#view-ask").hidden = !ask;
  $("#tab-search").setAttribute("aria-selected", String(!ask));
  $("#tab-ask").setAttribute("aria-selected", String(ask));
  history.replaceState(null, "", ask ? "#ask" : "#");
  if (ask) $("#askinput").focus();
}
$("#tab-search").onclick = () => setMode("search");
$("#tab-ask").onclick = () => setMode("ask");

/* ---------- classic search ---------- */
function paramsFromForm() {
  const p = new URLSearchParams();
  for (const [k, v] of new FormData(form)) if (String(v).trim() !== "") p.set(k, String(v).trim());
  p.set("sort", $("#sort").value);
  p.set("page", String(page));
  p.set("pageSize", "12");
  return p;
}
async function load() {
  $("#results").innerHTML = skeletons(6);
  try {
    const d = await api("/api/listings?" + paramsFromForm());
    $("#count").textContent = `${d.total} ${d.total === 1 ? "flat" : "flats"} for sale`;
    $("#results").innerHTML = d.items.length
      ? d.items.map((i) => card(i)).join("")
      : `<div class="empty" style="grid-column:1/-1">No flats match these filters. Widen the area or price range, or clear the filters.</div>`;
    $("#pager").innerHTML = d.totalPages > 1
      ? `<button class="btn ghost" id="prev" ${d.page <= 1 ? "disabled" : ""}>Previous</button>
         <span class="num">Page ${d.page} of ${d.totalPages}</span>
         <button class="btn ghost" id="next" ${d.page >= d.totalPages ? "disabled" : ""}>Next</button>`
      : "";
    $("#prev")?.addEventListener("click", () => { page--; load(); scrollTo({ top: 0 }); });
    $("#next")?.addEventListener("click", () => { page++; load(); scrollTo({ top: 0 }); });
  } catch (e) {
    $("#results").innerHTML = `<div class="error" style="grid-column:1/-1" role="alert">${esc(e.message)}. Is the server running and MySQL reachable?</div>`;
  }
}
form.addEventListener("submit", (e) => { e.preventDefault(); page = 1; load(); });
$("#sort").addEventListener("change", () => { page = 1; load(); });
$("#reset").addEventListener("click", () => { form.reset(); page = 1; load(); });

try {
  const f = await api("/api/facets");
  const sel = form.elements.city;
  for (const c of f.cities) sel.insertAdjacentHTML("beforeend", `<option value="${esc(c.city)}">${esc(c.city)} (${c.n})</option>`);
} catch { /* the list itself will show the error */ }
load();

/* ---------- describe-what-you-want (chat-style) ---------- */
const EXAMPLES = [
  "I want a nice, cheap flat, 40m in Kraków",
  "2 rooms with a balcony in Wrocław under 600k",
  "tanie mieszkanie 50 m2 w Gdańsku z windą",
  "family flat near a park, 3 rooms, Poznań",
];
$("#chips").innerHTML = EXAMPLES.map((t) => `<button type="button" class="chip">${esc(t)}</button>`).join("");
$("#chips").addEventListener("click", (e) => {
  if (e.target.classList.contains("chip")) { $("#askinput").value = e.target.textContent; ask(); }
});
$("#askform").addEventListener("submit", (e) => { e.preventDefault(); ask(); });

async function ask() {
  const message = $("#askinput").value.trim();
  if (message.length < 2) return;
  $("#askresults").innerHTML = skeletons(6);
  $("#interp").innerHTML = "";
  try {
    const d = await api("/api/chat", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ message }) });
    $("#interp").innerHTML = `<div class="interp"><b>We searched for:</b> ${esc(d.interpretation)}
      <span class="num" style="color:var(--muted)"> (${d.interpretedBy === "ai" ? "understood by AI" : "understood by rules"})</span>
      ${d.relaxed ? `<span class="note">No offer matched everything, so we ignored: ${esc(d.dropped.join(", "))}.</span>` : ""}</div>`;
    $("#askresults").innerHTML = d.items.length
      ? d.items.map((i) => card(i, { reasons: true })).join("")
      : `<div class="empty" style="grid-column:1/-1">Nothing found. Try naming a city, e.g. "flat in Kraków".</div>`;
  } catch (e) {
    $("#askresults").innerHTML = `<div class="error" style="grid-column:1/-1" role="alert">${esc(e.message)}</div>`;
  }
}

if (location.hash === "#ask") setMode("ask");
