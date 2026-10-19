import type { Data } from "@/core/validation/validation.utils";

import { z } from "zod";
import { Status, SubscriptionPlan, SubscriptionStatus } from "@/generated/prisma";

export const WORKSPACE_NAME_MAX_LENGTH = 80;

export const WorkspaceNameSchema = z.string().trim().min(1).max(WORKSPACE_NAME_MAX_LENGTH);

export const WorkspaceSummarySchema = z.object({
  companyId: z.string(),
  name: z.string().nullable(),
  status: z.enum(Status),
  roleName: z.string().nullable(),
  isAdmin: z.boolean(),
  isCurrent: z.boolean(),
  activeMemberCount: z.number().int().nonnegative().nullable(),
  subscription: z
    .object({
      status: z.enum(SubscriptionStatus),
      plan: z.enum(SubscriptionPlan),
      trialEndDate: z.date().nullable(),
    })
    .nullable(),
  joinedAt: z.date(),
  createdAt: z.date(),
});

export type WorkspaceSummary = Data<typeof WorkspaceSummarySchema>;
