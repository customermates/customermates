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

export const USE_CASE_AGENTS = ["mate", "claude"] as const;

export type UseCaseAgent = (typeof USE_CASE_AGENTS)[number];

/**
 * A card is either a described card (title, one sentence) or an agent card: which agent did the job
 * (`agent`), what it did (`done`) and the one step left for you (`you`, the full line such as "You: review and send").
 */
export const useCaseItemSchema = z
  .strictObject({
    agent: z.enum(USE_CASE_AGENTS).optional(),
    description: z.string().optional(),
    done: z.string().optional(),
    href: z.string().startsWith("/"),
    linkLabel: z.string(),
    title: z.string(),
    visual: z.enum(USE_CASE_VISUALS),
    you: z.string().optional(),
  })
  .refine((item) => (item.agent && item.done && item.you) || item.description, {
    message: "A use case needs either a description or agent, done and you",
  });

export const useCasesSchema = z.strictObject({
  description: z.string().optional(),
  eyebrow: z.string(),
  items: z.array(useCaseItemSchema).min(3).max(4),
  title: z.string(),
});

export type UseCaseItem = z.infer<typeof useCaseItemSchema>;
export type UseCases = z.infer<typeof useCasesSchema>;
