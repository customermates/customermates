import { z } from "zod";

export const DISCOVERY_CHOICES = [
  "searchEngine",
  "aiAssistant",
  "directory",
  "socialMedia",
  "recommendation",
  "articleOrVideo",
  "other",
] as const;
export type DiscoveryChoice = (typeof DISCOVERY_CHOICES)[number];

export const DISCOVERY_DETAIL_MAX_LENGTH = 120;

export const DiscoveryChoiceSchema = z.enum(DISCOVERY_CHOICES);

export function parseDiscoveryChoice(value: unknown): DiscoveryChoice | null {
  const parsed = DiscoveryChoiceSchema.safeParse(value);
  return parsed.success ? parsed.data : null;
}
