import "dotenv/config";

export const config = {
  port: Number(process.env.PORT ?? 3000),
  db: {
    host: process.env.DB_HOST ?? "127.0.0.1",
    port: Number(process.env.DB_PORT ?? 3306),
    user: process.env.DB_USER ?? "root",
    password: process.env.DB_PASSWORD ?? "",
    database: process.env.DB_NAME ?? "realestate",
  },
  ai: {
    apiKey: process.env.GEMINI_API_KEY?.trim() || "",
    model: process.env.GEMINI_MODEL?.trim() || "gemini-2.5-flash-lite",
  },
};

export const aiEnabled = () => config.ai.apiKey.length > 0;
