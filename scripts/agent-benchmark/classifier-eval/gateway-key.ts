import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

function keyFromDotEnv(): string | undefined {
  const file = join(process.cwd(), ".env");
  if (!existsSync(file)) return undefined;
  const line = readFileSync(file, "utf8")
    .split("\n")
    .find((entry) => entry.startsWith("AI_GATEWAY_API_KEY="));
  const value = line
    ?.slice("AI_GATEWAY_API_KEY=".length)
    .trim()
    .replace(/^["']|["']$/g, "");
  return value || undefined;
}

if (!process.env.AI_GATEWAY_API_KEY?.trim()) {
  const key = keyFromDotEnv();
  if (key) process.env.AI_GATEWAY_API_KEY = key;
}

export const GATEWAY_KEY = process.env.AI_GATEWAY_API_KEY?.trim() ?? "";
if (!GATEWAY_KEY)
  throw new Error("AI_GATEWAY_API_KEY is not set and .env has none");
