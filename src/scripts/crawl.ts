import { crawlOtodom } from "../crawler/otodom";
import { ingest } from "./ingest";

const args = process.argv.slice(2);
const limitArg = args.find((a) => a.startsWith("--limit="));
const limit = limitArg ? Number(limitArg.split("=")[1]) : 100;

(async () => {
  console.log(`Crawling up to ${limit} offers from otodom.pl …`);
  const raws = await crawlOtodom(limit);
  if (raws.length === 0) {
    console.error("✖ Nothing crawled (site blocked the request, no internet, or layout changed).");
    console.error("  Use `npm run seed` to load realistic demo data instead.");
    process.exit(1);
  }
  await ingest(raws, { noAi: args.includes("--no-ai") });
})();
