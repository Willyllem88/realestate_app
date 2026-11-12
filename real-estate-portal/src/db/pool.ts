import mysql from "mysql2/promise";
import { config } from "../config";

export const pool = mysql.createPool({
  ...config.db,
  waitForConnections: true,
  connectionLimit: 10,
  charset: "utf8mb4",
  decimalNumbers: true, // return DECIMAL columns as numbers, not strings
});
