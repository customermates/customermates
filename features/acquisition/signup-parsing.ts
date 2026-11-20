import { z } from "zod";

export type SearchParams = Record<string, string | string[] | undefined>;

export const CampaignValueSchema = z
  .string()
  .min(1)
  .max(128)
  .regex(/^[\p{L}\p{N}._~+\- ]+$/u);

export function firstValue(value: string | string[] | null | undefined): string | undefined {
  return (Array.isArray(value) ? value[0] : value) ?? undefined;
}

export function campaignValue(value: string | string[] | null | undefined): string | null {
  const parsed = CampaignValueSchema.safeParse(firstValue(value)?.trim());
  return parsed.success ? parsed.data : null;
}

export function parseHttpUrl(value: string | null | undefined): URL | null {
  if (!value) return null;
  try {
    const url = new URL(value);
    return url.protocol === "https:" || url.protocol === "http:" ? url : null;
  } catch {
    return null;
  }
}

export function isSameSite(url: URL | null, baseUrl: string): url is URL {
  return url !== null && url.host === new URL(baseUrl).host;
}

export function decodeJson<T>(schema: z.ZodType<T>, text: string): T | null {
  try {
    const parsed = schema.safeParse(JSON.parse(text));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}
