import { z } from "zod";

import { formatDatesInResponse, runInteractor, toonResult } from "./utils";

import { BILLING_USAGE_MONTH_PATTERN } from "@/ee/operator/billing-usage.schema";
import { getGetOperatorBillingUsageInteractor } from "@/core/di";

const GetOperatorUsageSchema = z.object({
  month: z
    .string()
    .regex(BILLING_USAGE_MONTH_PATTERN)
    .describe("Calendar month as YYYY-MM, evaluated in UTC, e.g. 2026-09"),
  workspaceId: z
    .union([z.uuid(), z.literal("all")])
    .default("all")
    .describe(
      "Workspace (company) id for one workspace with per-user and per-channel detail, or all (default) for the summary of every workspace that existed in the month",
    ),
});

const GetOperatorUsageOutputSchema = z.looseObject({
  month: z.string(),
  from: z.string(),
  to: z.string(),
  monthComplete: z.boolean(),
  workspaces: z.array(z.looseObject({ companyId: z.string(), workspaceLabel: z.string() })),
});

export const getOperatorUsageTool = {
  name: "get_operator_usage",
  title: "Get operator billing usage",
  description:
    "Platform operators only. Use this when you need billable usage per workspace for one calendar month (UTC). " +
    "Required: month (YYYY-MM). Optional: workspaceId (a workspace id, or all). " +
    "seats.count counts every user who was active at any time in the month, for the full month; channels.peak is the highest number of messaging channels connected at the same time, reached at channels.peakAt; current holds active seats and connected channels right now. " +
    "With a workspaceId, seats.users lists each user with name, email, role, addedAt and deactivatedAt, and channels.items lists each channel with provider, identifier, connectedAt and disconnectedAt. " +
    "coverage.complete is false when the month predates the recorded history (coverage.recordedFrom) or some times are inexact (coverage.inexactTimes, *Exact false); report such numbers as incomplete. " +
    "Deleted workspaces keep their history and carry deletedAt. Read-only.",
  annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  inputSchema: GetOperatorUsageSchema,
  outputSchema: GetOperatorUsageOutputSchema,
  execute: (params: z.input<typeof GetOperatorUsageSchema>) => {
    const workspaceId = params.workspaceId ?? "all";

    return runInteractor(
      getGetOperatorBillingUsageInteractor().invoke({
        month: params.month,
        ...(workspaceId === "all" ? {} : { companyId: workspaceId }),
      }),
      (data) => toonResult(formatDatesInResponse(data)),
    );
  },
};
