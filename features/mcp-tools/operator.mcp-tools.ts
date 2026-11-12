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
  subscriptions: z.looseObject({ workspaces: z.number(), paying: z.number() }),
  workspaces: z.array(
    z.looseObject({ companyId: z.string(), workspaceLabel: z.string(), ownerEmail: z.string().nullable() }),
  ),
});

export const getOperatorUsageTool = {
  name: "get_operator_usage",
  title: "Get operator billing usage",
  description:
    "Use this when you need billable usage per workspace for one calendar month (UTC), or how many workspaces pay and on which plan and billing; available to platform operators only. " +
    "Required: month (YYYY-MM). Optional: companyId (one workspace; omit for all). " +
    "Each workspace carries companyId (the unique key), workspaceLabel (the workspace name, otherwise the owner email with the first eight characters of companyId, or the short ID when no owner exists) and ownerEmail (the owner: active users first, then system roles, then the oldest; null when no owner exists or the workspace was deleted). " +
    "seats.count counts every user who was active at any time in the month, for the full month; channels.peak is the highest number of messaging channels connected at the same time, reached at channels.peakAt; current holds active seats and connected channels right now. " +
    "subscription holds the workspace's subscription right now, not as it was in the month: plan, status, billing (lemonSqueezy when Lemon Squeezy bills it, manual for contracts billed outside it, such as enterprise), quantity, trialEndDate, currentPeriodEnd and enterpriseAgentCreditsPerUser; null for a deleted workspace or one without a subscription. " +
    "subscriptions summarizes the listed workspaces: workspaces with a subscription, paying (status active; trials, pastDue, unPaid, cancelled and expired are not counted) and groups by billing, plan and status with workspace and active seat counts; use the current month for today's customers. " +
    "With a companyId, seats.users lists each user with name, email, role, addedAt and deactivatedAt, and channels.items lists each channel with provider, identifier, connectedAt and disconnectedAt. " +
    "acquisition holds signupTemplate, lastPageBeforeSignup (the last same-site page path before the signup form, recorded without a cookie), discovery (the owner's optional answer to how they found Customermates: choice and detail, choice null when skipped, discovery null when never asked) and consentedSource (job, landingPath, referrerHost, utm fields and marketingConsentedAt, stored only with marketing consent; null without it). " +
    "activation holds firstValue (setupCompletedAt, wizardCompletedAt, agentFirstCallAt, firstChannelConnectedAt, firstModelChangeAt, firstRecordCreatedAt; null while not reached; agentFirstCallAt falls back to the first agent record write for workspaces older than the first-call record) and the active workspace definition: active is true when setup is completed (workspace setup or the owner's onboarding wizard), an agent or a channel is connected, and a member or agent changed a record or the data model in days 8 to 14 after creation; activeSince is the date all three held, otherwise notActiveBecause is setupNotCompleted, noAgentOrChannelConnected, secondWeekNotReached or noChangeInSecondWeek. acquisition and activation are null for a deleted workspace. " +
    "coverage.complete is false when the month predates the recorded history (coverage.recordedFrom) or some times are inexact (coverage.inexactTimes, *Exact false); report such numbers as incomplete. " +
    "Workspaces deleted after recording started keep their history and carry deletedAt; those deleted before recordingStartedAt are missing. Read-only.",
  annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  inputSchema: GetOperatorUsageSchema,
  outputSchema: GetOperatorUsageOutputSchema,
  execute: (params: z.infer<typeof GetOperatorUsageSchema>) =>
    runInteractor(getGetOperatorBillingUsageInteractor().invoke(params), (data) =>
      toonResult(formatDatesInResponse(data)),
    ),
};
