import { z } from "zod";

import { zx } from "@/core/validation/validation.utils";
import {
  AutomationConditionSchema,
  AutomationEffectSchema,
  AutomationTriggerSchema,
  AUTOMATION_CONDITION_LIMIT,
  AUTOMATION_EFFECT_LIMIT,
  AUTOMATION_RULE_NAME_MAX_CHARS,
} from "@/features/automation-rules/automation-rule.schema";

export const COMPOSE_SENTENCE_MAX_CHARS = 600;

export const COMPOSE_REFUSAL_REASONS = [
  "unclear",
  "unsupported",
  "invalid",
  "unavailable",
  "credits",
  "rateLimited",
] as const;
export type ComposeRefusalReason = (typeof COMPOSE_REFUSAL_REASONS)[number];

export const ComposeAutomationSchema = z.object({ sentence: zx.nonBlankText(COMPOSE_SENTENCE_MAX_CHARS) }).strict();
export type ComposeAutomationData = z.output<typeof ComposeAutomationSchema>;

export const ComposedDraftSchema = z.object({
  name: zx.nonBlankText(AUTOMATION_RULE_NAME_MAX_CHARS),
  trigger: AutomationTriggerSchema,
  conditions: z.array(AutomationConditionSchema).max(AUTOMATION_CONDITION_LIMIT),
  effects: z.array(AutomationEffectSchema).min(1).max(AUTOMATION_EFFECT_LIMIT),
});
export type ComposedDraft = z.output<typeof ComposedDraftSchema>;

export const ComposeModelOutputSchema = z.discriminatedUnion("status", [
  z.object({ status: z.literal("draft"), draft: ComposedDraftSchema }),
  z.object({ status: z.literal("refused"), reason: z.enum(["unclear", "unsupported"]) }),
]);
export type ComposeModelOutput = z.output<typeof ComposeModelOutputSchema>;

export const ComposeAutomationResultSchema = z.discriminatedUnion("status", [
  z.object({
    status: z.literal("draft"),
    draft: ComposedDraftSchema.extend({ enabled: z.boolean(), conditions: z.array(AutomationConditionSchema) }),
  }),
  z.object({ status: z.literal("refused"), reason: z.enum(COMPOSE_REFUSAL_REASONS) }),
]);
export type ComposeAutomationResult = z.output<typeof ComposeAutomationResultSchema>;
