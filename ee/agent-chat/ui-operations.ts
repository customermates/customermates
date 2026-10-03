import { z } from "zod";

import type { Data } from "@/core/validation/validation.utils";

import { NavigationUiTargetIdSchema } from "./ui-targets";

export const NavigateRecordTargetSchema = z.object({ typeId: z.uuid(), recordId: z.uuid() }).strict();

export type NavigateRecordTarget = Data<typeof NavigateRecordTargetSchema>;

export const NavigateInputSchema = z
  .object({
    targetId: NavigationUiTargetIdSchema.optional().describe("A routable target id from list_ui_targets."),
    typeId: z
      .uuid()
      .optional()
      .describe("Together with recordId: the stable ID of the configured type whose record page opens."),
    recordId: z
      .uuid()
      .optional()
      .describe(
        "Together with typeId: the id of an existing record found with query_crm_records or search_crm_records.",
      ),
  })
  .strict()
  .superRefine((value, ctx) => {
    const hasTarget = value.targetId !== undefined;
    const hasRecord = value.typeId !== undefined || value.recordId !== undefined;
    if (hasTarget === hasRecord) {
      ctx.addIssue({ code: "custom", message: "Pass either targetId, or typeId together with recordId." });
      return;
    }
    if (hasRecord && (value.typeId === undefined || value.recordId === undefined))
      ctx.addIssue({ code: "custom", message: "typeId and recordId are required together." });
  });

export type NavigateInput = Data<typeof NavigateInputSchema>;
