import { z } from "zod";

import { RecordRefSchema } from "@/features/records/record-model.schema";
import { AutomationTriggerKindSchema } from "./automation-rule.schema";

export const AutomationRuleFiredPayloadSchema = z.object({
  webhookId: z.uuid(),
  ruleId: z.uuid(),
  ruleName: z.string(),
  runId: z.uuid(),
  trigger: AutomationTriggerKindSchema,
  firedAt: z.iso.datetime(),
  record: RecordRefSchema.nullable(),
});
export type AutomationRuleFiredPayload = z.infer<typeof AutomationRuleFiredPayloadSchema>;
