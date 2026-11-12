/**
 * Demo data generator (MOCK). Produces ~100 realistic, deliberately MESSY Polish offers so the whole
 * pipeline can be demonstrated offline: prices as strings, missing values, lowercase cities,
 * HTML descriptions, typos, negations ("bez windy") and a few cross-posted duplicates.
 * Run: npm run seed
 */
import type { RawListing } from "../types";
import { ingest } from "./ingest";

function rng(seed: number) {
  return () => {
    seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rand = rng(2024);
const pick = <T>(a: T[]) => a[Math.floor(rand() * a.length)];
const chance = (p: number) => rand() < p;
const between = (a: number, b: number) => a + rand() * (b - a);

const CITIES: Record<string, { ppm: number; districts: string[]; streets: string[]; lat: number; lng: number }> = {
  Kraków: { ppm: 17500, lat: 50.06, lng: 19.94, districts: ["Podgórze", "Kazimierz", "Nowa Huta", "Krowodrza", "Prądnik Biały", "Dębniki", "Bronowice"], streets: ["ul. Dietla", "ul. Starowiślna", "ul. Kalwaryjska", "ul. Wielicka", "os. Teatralne", "ul. Opolska", "ul. Zielna"] },
  Warszawa: { ppm: 21000, lat: 52.23, lng: 21.01, districts: ["Mokotów", "Wola", "Praga-Południe", "Ursynów", "Bemowo", "Białołęka"], streets: ["ul. Puławska", "ul. Wolska", "ul. Grochowska", "ul. Jana Pawła II", "ul. Płowiecka"] },
  Wrocław: { ppm: 16500, lat: 51.11, lng: 17.03, districts: ["Krzyki", "Fabryczna", "Psie Pole", "Stare Miasto", "Śródmieście"], streets: ["ul. Legnicka", "ul. Grabiszyńska", "ul. Borowska", "ul. Kamienna"] },
  Gdańsk: { ppm: 18500, lat: 54.35, lng: 18.65, districts: ["Wrzeszcz", "Oliwa", "Zaspa", "Przymorze", "Śródmieście"], streets: ["ul. Grunwaldzka", "ul. Kartuska", "ul. Obrońców Wybrzeża", "ul. Chmielna"] },
  Poznań: { ppm: 15500, lat: 52.41, lng: 16.93, districts: ["Jeżyce", "Wilda", "Grunwald", "Nowe Miasto", "Stare Miasto"], streets: ["ul. Dąbrowskiego", "ul. Głogowska", "ul. Grunwaldzka", "ul. Kościelna"] },
  Łódź: { ppm: 10500, lat: 51.76, lng: 19.46, districts: ["Bałuty", "Widzew", "Polesie", "Śródmieście"], streets: ["ul. Piotrkowska", "ul. Kilińskiego", "ul. Rzgowska", "ul. Łagiewnicka"] },
};
const CITY_WEIGHTS = ["Kraków", "Kraków", "Kraków", "Warszawa", "Warszawa", "Wrocław", "Gdańsk", "Poznań", "Łódź"];

const CONDITIONS = [
  { key: "excellent", w: 3, txt: ["Mieszkanie po generalnym remoncie, wysoki standard wykończenia.", "Nowoczesne wykończenie, gotowe do zamieszkania od zaraz."] },
  { key: "good", w: 5, txt: ["Bardzo dobry stan, gotowe do zamieszkania.", "Mieszkanie w dobrym stanie technicznym, zadbana klatka."] },
  { key: "to_renovate", w: 2, txt: ["Mieszkanie do remontu, duży potencjał.", "Lokal do odświeżenia, idealny dla inwestora."] },
  { key: "none", w: 3, txt: [""] },
];
const condPool = CONDITIONS.flatMap((c) => Array(c.w).fill(c));

function describe(o: { city: string; district: string; street: string; floor: number; floors: number; area: number; rooms: number; elevator: boolean | null; balcony: boolean | null; parking: boolean | null; cond: (typeof CONDITIONS)[number]; year: number | null }) {
  const parts: string[] = [];
  parts.push(pick([
    `Na sprzedaż ${o.rooms}-pokojowe mieszkanie o powierzchni ${String(o.area).replace(".", ",")} m² w sercu dzielnicy ${o.district}.`,
    `Prezentuję do sprzedaży ${o.rooms} pokoje, ${o.area} m2, ${o.city}, ${o.district}, ${o.street}.`,
    `OKAZJA!!! Mieszkanie ${o.rooms} pok. ${o.district} blisko komunikacji miejskiej, sklepów i szkół.`,
    `Oferta bezpośrednia, bez prowizji. Mieszkanie przy ${o.street}.`,
  ]));
  if (o.floor === 0) parts.push(chance(0.5) ? "Mieszkanie na parterze." : "Parter.");
  else parts.push(pick([`Położone na ${o.floor} piętrze w ${o.floors}-piętrowym budynku.`, `Piętro ${o.floor}/${o.floors}.`, `${o.floor} piętro z ${o.floors}.`]));
  if (o.year) parts.push(pick([`Rok budowy ${o.year}.`, `Budynek z ${o.year} roku.`]));
  if (o.cond.txt[0]) parts.push(pick(o.cond.txt));
  if (o.elevator === true) parts.push("W budynku jest winda.");
  if (o.elevator === false) parts.push(pick(["Niestety bez windy.", "Brak windy w budynku."]));
  if (o.balcony === true) parts.push(pick(["Słoneczny balkon od strony południowej.", "Do mieszkania przynależy duży taras.", "Balkon z widokiem na zieleń."]));
  if (o.balcony === false) parts.push("Mieszkanie bez balkonu.");
  if (o.parking === true) parts.push(pick(["W cenie miejsce postojowe w hali garażowej.", "Garaż podziemny w cenie.", "Dostępne miejsce parkingowe na osiedlu."]));
  if (chance(0.5)) parts.push(pick(["Cicha okolica, blisko parku.", "Świetna lokalizacja, tramwaj pod domem.", "Okolica spokojna, dużo zieleni.", "Blisko metra i centrum handlowego."]));
  parts.push(pick(["Zapraszam na prezentację!", "Tel. kontaktowy w ogłoszeniu.", "Możliwość negocjacji ceny.", "Zapraszam do kontaktu."]));
  const text = parts.join(" ");
  return chance(0.35) ? `<p>${parts.slice(0, 2).join(" ")}</p><p>${parts.slice(2).join(" ")}</p>` : text;
}

function makeOffer(i: number): RawListing {
  const city = pick(CITY_WEIGHTS);
  const c = CITIES[city];
  const district = pick(c.districts);
  const street = pick(c.streets);
  const area = Math.round(between(22, 105) * 10) / 10;
  const rooms = Math.max(1, Math.min(5, Math.round(area / 22 + between(-0.6, 0.6))));
  const floors = pick([4, 5, 5, 6, 8, 10, 11]);
  const floor = Math.floor(rand() * (floors + 1));
  const year = chance(0.55) ? pick([1912, 1938, 1965, 1974, 1983, 1996, 2008, 2015, 2019, 2022]) : null;
  const cond = pick(condPool);
  const elevator = floors >= 6 ? (chance(0.8) ? true : chance(0.5) ? false : null) : chance(0.3) ? false : null;
  const balcony = chance(0.55) ? true : chance(0.3) ? false : null;
  const parking = chance(0.3) ? true : null;

  let ppm = c.ppm * between(0.8, 1.25);
  if (cond.key === "excellent") ppm *= 1.1;
  if (cond.key === "to_renovate") ppm *= 0.8;
  if (district === "Śródmieście" || district === "Kazimierz" || district === "Stare Miasto") ppm *= 1.12;
  let price: number | string | null = Math.round((ppm * area) / 1000) * 1000;

  // ---- inject real-world noise ----
  if (chance(0.08)) price = null;                                           // "Zapytaj o cenę"
  else if (chance(0.15)) price = `${Number(price).toLocaleString("pl-PL")} zł`;  // price as text
  else if (chance(0.03)) price = Math.round(Number(price) / 100);          // typo: missing zeros
  else if (chance(0.03)) price = Number(price) * 10;                       // typo: extra zero
  let areaOut: number | string | null = area;
  if (chance(0.15)) areaOut = `${String(area).replace(".", ",")} m²`;
  if (chance(0.04)) areaOut = null;
  let cityOut = city;
  if (chance(0.15)) cityOut = city.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/ł/g, "l"); // "krakow"
  const description = chance(0.1) ? "" : describe({ city, district, street, floor, floors, area, rooms, elevator, balcony, parking, cond, year });
  const nice = cond.key === "excellent" ? pick(["Piękne", "Jasne", "Nowoczesne"]) : cond.key === "to_renovate" ? "Do remontu:" : pick(["Mieszkanie", "Przytulne", "Komfortowe", "Sprzedam"]);

  return {
    source: "seed",
    sourceId: `demo-${i}`,
    title: `${nice} ${rooms}-pokojowe ${String(area).replace(".", ",")} m², ${district}, ${city}`.replace("  ", " "),
    description,
    price,
    area: areaOut,
    rooms: chance(0.85) ? rooms : null,
    floor: chance(0.5) ? floor : null,             // often only stated inside the description
    totalFloors: null,
    city: cityOut,
    district: chance(0.9) ? district : null,
    street: chance(0.75) ? street : null,
    lat: chance(0.7) ? Number((c.lat + between(-0.04, 0.04)).toFixed(5)) : null,
    lng: chance(0.7) ? Number((c.lng + between(-0.06, 0.06)).toFixed(5)) : null,
    images: [],
  };
}

(async () => {
  const offers: RawListing[] = [];
  for (let i = 1; i <= 96; i++) offers.push(makeOffer(i));
  // 4 cross-posted duplicates: same flat, different wording/id (e.g. another agency)
  for (let k = 0; k < 4; k++) {
    const src = offers[10 + k * 17];
    offers.push({ ...src, sourceId: `demo-dup-${k}`, title: `${src.title} (okazja!)`, description: `${src.description ?? ""} Zapraszam.` });
  }
  await ingest(offers);
})();
