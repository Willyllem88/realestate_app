import fs from "node:fs";
import path from "node:path";
import mysql from "mysql2/promise";
import { config } from "../config";

async function main() {
  const { database, ...conn } = config.db;
  const c = await mysql.createConnection({ ...conn, multipleStatements: true });
  await c.query(
    `CREATE DATABASE IF NOT EXISTS \`${database}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`
  );
  await c.query(`USE \`${database}\``);
  const schema = fs.readFileSync(path.join(__dirname, "schema.sql"), "utf8");
  await c.query(schema);
  await c.end();
  console.log(`✔ Database "${database}" and table "listings" are ready.`);
}

main().catch((e) => {
  console.error("✖ DB init failed:", e.message);
  console.error("  Is MySQL running and are the credentials in .env correct?");
  process.exit(1);
});
