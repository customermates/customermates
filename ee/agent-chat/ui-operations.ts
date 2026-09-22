import { z } from "zod";

import type { Data } from "@/core/validation/validation.utils";

import { NavigationUiTargetIdSchema } from "./ui-targets";

export const AGENT_RECORD_ENTITIES = ["contact", "organization", "deal", "service", "task"] as const;

export const NavigateRecordTargetSchema = z.object({
  entity: z.enum(AGENT_RECORD_ENTITIES),
  recordId: z.uuid(),
});

export type NavigateRecordTarget = Data<typeof NavigateRecordTargetSchema>;

export const NavigateInputSchema = z
  .object({
    targetId: NavigationUiTargetIdSchema.optional().describe("A routable target id from list_ui_targets."),
    entity: z
      .enum(AGENT_RECORD_ENTITIES)
      .optional()
      .describe("Together with recordId: the type of the existing record whose page opens."),
    recordId: z
      .uuid()
      .optional()
      .describe("Together with entity: the id of an existing record found with list_records or search_records."),
  })
  .superRefine((value, ctx) => {
    const hasTarget = value.targetId !== undefined;
    const hasRecord = value.entity !== undefined || value.recordId !== undefined;
    if (hasTarget === hasRecord) {
      ctx.addIssue({ code: "custom", message: "Pass either targetId, or entity together with recordId." });
      return;
    }
    if (hasRecord && (value.entity === undefined || value.recordId === undefined))
      ctx.addIssue({ code: "custom", message: "entity and recordId are required together." });
  });

export type NavigateInput = Data<typeof NavigateInputSchema>;
