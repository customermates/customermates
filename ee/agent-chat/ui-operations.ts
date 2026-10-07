import { z } from "zod";

import type { Data } from "@/core/validation/validation.utils";

import { NavigationUiTargetIdSchema } from "./ui-targets";
import { isResolvedAppLinkPath } from "@/features/docs/app-links";

export const NavigateRecordTargetSchema = z.object({ typeId: z.uuid(), recordId: z.uuid() }).strict();

export type NavigateRecordTarget = Data<typeof NavigateRecordTargetSchema>;

export const NavigateInputSchema = z
  .object({
    targetId: NavigationUiTargetIdSchema.optional().describe("A routable target id from list_ui_targets."),
    href: z
      .string()
      .refine(isResolvedAppLinkPath, "Use an app link exactly as a docs result gave it.")
      .optional()
      .describe("An app link from a search_docs or get_docs_page result, exactly as given."),
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
    const hasRecord = value.typeId !== undefined || value.recordId !== undefined;
    const choices = [value.targetId !== undefined, value.href !== undefined, hasRecord].filter(Boolean).length;
    if (choices !== 1) {
      ctx.addIssue({ code: "custom", message: "Pass either targetId, href, or typeId together with recordId." });
      return;
    }
    if (hasRecord && (value.typeId === undefined || value.recordId === undefined))
      ctx.addIssue({ code: "custom", message: "typeId and recordId are required together." });
  });

export type NavigateInput = Data<typeof NavigateInputSchema>;
