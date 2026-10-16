import { z } from "zod";

import { formatDatesInResponse, runInteractor, toonResult } from "./utils";

import { BillingUsageMonthSchema, GetOperatorBillingUsageSchema } from "@/ee/operator/billing-usage.schema";
import { getGetOperatorBillingUsageInteractor } from "@/core/di";

const GetOperatorUsageSchema = GetOperatorBillingUsageSchema.extend({
  month: BillingUsageMonthSchema.describe("Calendar month as YYYY-MM, evaluated in UTC, e.g. 2026-09"),
  companyId: z
    .uuid()
    .optional()
    .describe(
      "Use workspaces[].companyId from an earlier get_operator_usage result for one workspace with per-user and per-channel detail; omit for the summary of every workspace that existed in the month",
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
    "Use this when you need billable usage per workspace for one calendar month (UTC); available to platform operators only. " +
    "Required: month (YYYY-MM). Optional: companyId (one workspace; omit for all). " +
    "seats.count counts every user who was active at any time in the month, for the full month; channels.peak is the highest number of messaging channels connected at the same time, reached at channels.peakAt; current holds active seats and connected channels right now. " +
    "With a companyId, seats.users lists each user with name, email, role, addedAt and deactivatedAt, and channels.items lists each channel with provider, identifier, connectedAt and disconnectedAt. " +
    "coverage.complete is false when the month predates the recorded history (coverage.recordedFrom) or some times are inexact (coverage.inexactTimes, *Exact false); report such numbers as incomplete. " +
    "Workspaces deleted after recording started keep their history and carry deletedAt; those deleted before recordingStartedAt are missing. Read-only.",
  annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  inputSchema: GetOperatorUsageSchema,
  outputSchema: GetOperatorUsageOutputSchema,
  execute: (params: z.input<typeof GetOperatorUsageSchema>) =>
    runInteractor(getGetOperatorBillingUsageInteractor().invoke(params), (data) =>
      toonResult(formatDatesInResponse(data)),
    ),
};
