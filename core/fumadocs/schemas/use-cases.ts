import { z } from "zod";

export const USE_CASE_VISUALS = [
  "agent",
  "calendar",
  "contacts",
  "conversation",
  "dashboard",
  "import",
  "inbox",
  "pipeline",
  "playbook",
  "proposal",
  "search",
  "team",
] as const;

export type UseCaseVisual = (typeof USE_CASE_VISUALS)[number];

export const useCaseItemSchema = z.strictObject({
  description: z.string(),
  href: z.string().startsWith("/"),
  linkLabel: z.string(),
  title: z.string(),
  visual: z.enum(USE_CASE_VISUALS),
});

export const useCasesSchema = z.strictObject({
  description: z.string().optional(),
  eyebrow: z.string(),
  items: z.array(useCaseItemSchema).min(3).max(4),
  title: z.string(),
});

export type UseCaseItem = z.infer<typeof useCaseItemSchema>;
export type UseCases = z.infer<typeof useCasesSchema>;
