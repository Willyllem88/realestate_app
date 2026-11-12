import { z } from "zod";
import { aiEnabled, config } from "../config";

const COOLDOWN_MS = 3000;
const MAX_RETRIES = 3;

let lastRequestAt = 0;
let requestQueue: Promise<void> = Promise.resolve();

const sleep = (ms: number) =>
  new Promise<void>((resolve) => setTimeout(resolve, ms));

function getRetryAfter(res: Response): number | null {
  const value = res.headers.get("retry-after");
  if (!value) return null;

  const seconds = Number(value);
  if (Number.isFinite(seconds)) return seconds * 1000;

  const date = Date.parse(value);
  return Number.isNaN(date) ? null : Math.max(0, date - Date.now());
}

/**
 * Optional LLM layer. If GEMINI_API_KEY is empty, every function here returns null
 * and the callers use the rule-based fallbacks. Output is always validated with zod:
 * the model is treated as an untrusted parser, never as a source of truth.
 */
export async function callGemini(system: string, user: string, maxTokens = 700): Promise<string | null> {
  if (!aiEnabled()) return null;
  const task = requestQueue.then(async (): Promise<string | null> => {
    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
      // Minimum interval between request starts.
      const elapsed = Date.now() - lastRequestAt;
      const wait = Math.max(0, COOLDOWN_MS - elapsed);

      if (wait > 0) await sleep(wait);

      lastRequestAt = Date.now();
      try {
        const res = await fetch(
          `https://generativelanguage.googleapis.com/v1beta/models/${config.ai.model}:generateContent`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "x-goog-api-key": config.ai.apiKey,
            },
            body: JSON.stringify({
              systemInstruction: {
                parts: [{ text: system }],
              },
              contents: [
                {
                  role: "user",
                  parts: [{ text: user }],
                },
              ],
              generationConfig: {
                maxOutputTokens: maxTokens,
                responseMimeType: "application/json",
              },
            }),
          }
        );

        if (!res.ok) {
          const retryable =
            res.status === 429 ||
            res.status === 408 ||
            res.status >= 500;

          const error = (await res.text()).slice(0, 200);

          if (!retryable || attempt === MAX_RETRIES) {
            console.warn(`[ai] HTTP ${res.status}: ${error}`);
            return null;
          }

          const delay =
            getRetryAfter(res) ?? 2000 * 2 ** attempt;

          console.warn(
            `[ai] HTTP ${res.status}, retry ${attempt + 1}/${MAX_RETRIES} in ${Math.ceil(delay / 1000)}s`
          );

          await sleep(delay);
          continue;
        }

        const data = await res.json();

        return (
          data.candidates?.[0]?.content?.parts
            ?.map((part: any) => part.text ?? "")
            .join("") || null
        );
      } catch (e: any) {
        if (attempt === MAX_RETRIES) {
          console.warn("[ai] request failed:", e.message);
          return null;
        }

        const delay = 2000 * 2 ** attempt;
        console.warn(`[ai] Network error. Retrying in ${delay / 1000}s`);

        await sleep(delay);
      }
    }

    return null;
  });

  // Keep the queue usable even if a task unexpectedly rejects.
  requestQueue = task.then(() => undefined, () => undefined);

  return task;
}

export function parseJsonLoose(text: string | null): unknown {
  if (!text) return null;
  const cleaned = text.replace(/```json|```/g, "").trim();
  const start = cleaned.indexOf("{");
  const end = cleaned.lastIndexOf("}");
  if (start < 0 || end < 0) return null;
  try {
    return JSON.parse(cleaned.slice(start, end + 1));
  } catch {
    return null;
  }
}

const nb = z.boolean().nullable().optional();
const ni = z.number().int().nullable().optional();
const ExtractSchema = z.object({
  floor: ni,
  totalFloors: ni,
  yearBuilt: ni,
  market: z.enum(["primary", "secondary"]).nullable().optional(),
  conditionState: z.enum(["to_renovate", "good", "excellent", "developer_standard"]).nullable().optional(),
  hasElevator: nb,
  hasBalcony: nb,
  hasParking: nb,
  summary: z.string().max(600).nullable().optional(),
});
export type AiExtraction = z.infer<typeof ExtractSchema>;

const SYSTEM = `You extract structured data from Polish real-estate listings.
Return ONLY a JSON object, no prose, with these keys:
floor (int, 0=ground), totalFloors (int), yearBuilt (int), market ("primary"|"secondary"),
conditionState ("to_renovate"|"good"|"excellent"|"developer_standard"),
hasElevator, hasBalcony (balcony/terrace/loggia), hasParking (garage or parking spot) -> true/false,
summary (max 2 sentences, English, factual, neutral tone).
Rules: use null when the text does not say. Never guess. Explicit negations ("bez windy") are false.
Ignore marketing fluff. Do not invent facts in the summary.`;

export async function extractWithAI(title: string, description: string): Promise<AiExtraction | null> {
  if (!aiEnabled() || description.length < 40) return null;
  const out = await callGemini(
    SYSTEM,
    `TITLE: ${title}\n\nDESCRIPTION:\n${description.slice(0, 4000)}`
  );
  console.log("[extract] Gemini output:", out);
  const parsed = ExtractSchema.safeParse(parseJsonLoose(out));
  return parsed.success ? parsed.data : null;
}
