import { z } from "zod";

export const EVENT_VIA_KINDS = ["apiKey", "oauthApplication", "form", "incomingWebhook"] as const;
export const EVENT_VIA_NAME_MAX_LENGTH = 100;

export const EventViaSchema = z
  .object({
    kind: z
      .enum(EVENT_VIA_KINDS)
      .describe(
        "What the change came through: an API key, an OAuth application such as an MCP client, a public form or an incoming webhook",
      ),
    name: z
      .string()
      .min(1)
      .max(EVENT_VIA_NAME_MAX_LENGTH)
      .describe("The name of the API key, OAuth application, form or incoming webhook when the change was made"),
  })
  .strict();

export type EventVia = z.infer<typeof EventViaSchema>;

function truncated(text: string): string {
  let result = "";
  for (const character of text) {
    if (result.length + character.length > EVENT_VIA_NAME_MAX_LENGTH) break;
    result += character;
  }
  return result.trim();
}

export function eventVia(kind: EventVia["kind"], rawName: string | null | undefined): EventVia | null {
  const name = truncated((rawName ?? "").replace(/[\p{Cc}\p{Cf}\s]+/gu, " ").trim());
  return name ? { kind, name } : null;
}

export function storedEventVia(value: unknown): EventVia | null {
  const parsed = EventViaSchema.safeParse(value);
  return parsed.success ? parsed.data : null;
}
