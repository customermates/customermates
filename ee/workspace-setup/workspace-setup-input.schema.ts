import type { Data } from "@/core/validation/validation.utils";

import { z } from "zod";

import { TEMPLATE_SLUGS } from "@/core/templates/template-slugs";
import { SetupAnswerValueSchema } from "@/features/workspace-setup/setup-answers.schema";
import { SETUP_PART_IDS } from "@/features/workspace-setup/setup-interview";
import { APP_LOCALES } from "@/i18n/locale-registry";

import { SETUP_FOLLOW_UP_IDS, WORKSPACE_SETUP_PHASES } from "./workspace-setup.schema";

export const StartWorkspaceSetupSchema = z
  .object({
    locale: z.enum(APP_LOCALES).optional(),
    templateSlug: z.enum(TEMPLATE_SLUGS).optional(),
  })
  .strict();
export type StartWorkspaceSetupData = Data<typeof StartWorkspaceSetupSchema>;

export const SaveWorkspaceSetupAnswersSchema = z
  .object({
    setupId: z.uuid(),
    answers: z.partialRecord(z.enum(SETUP_PART_IDS), SetupAnswerValueSchema.nullable()).default({}),
    followUpAnswers: z
      .array(z.object({ id: z.enum(SETUP_FOLLOW_UP_IDS), value: SetupAnswerValueSchema }).strict())
      .max(SETUP_FOLLOW_UP_IDS.length)
      .default([]),
  })
  .strict();
export type SaveWorkspaceSetupAnswersData = Data<typeof SaveWorkspaceSetupAnswersSchema>;

export const WorkspaceSetupIdSchema = z.object({ setupId: z.uuid() }).strict();
export type WorkspaceSetupIdData = Data<typeof WorkspaceSetupIdSchema>;

export const ConfirmWorkspaceSetupSchema = z
  .object({ setupId: z.uuid(), planRevision: z.number().int().nonnegative() })
  .strict();
export type ConfirmWorkspaceSetupData = Data<typeof ConfirmWorkspaceSetupSchema>;

export const RetryWorkspaceSetupPhaseSchema = z
  .object({
    setupId: z.uuid(),
    phase: z.enum(WORKSPACE_SETUP_PHASES),
  })
  .strict();
export type RetryWorkspaceSetupPhaseData = Data<typeof RetryWorkspaceSetupPhaseSchema>;
