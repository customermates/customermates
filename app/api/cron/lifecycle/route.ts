import * as ErrorReporter from "@/core/observability/server";

import {
  getDeactivateUsersAfterSubscriptionGracePeriodInteractor,
  getSendTrialExtensionOfferInteractor,
  getSendWelcomeAndDemoInteractor,
  getDeleteConnectedAccountsForExpiredTrialsInteractor,
  getDeleteConnectedAccountsForInactiveOwnersInteractor,
  getDeleteOrphanedUnipileAccountsInteractor,
  getExpireAdAttributionInteractor,
  getSendLegalDocumentNoticesInteractor,
  getPruneRoutineRunsInteractor,
  getPruneAutomationRuleRunsInteractor,
  getPruneAgentJobsInteractor,
  getPruneNotificationsInteractor,
  getPruneIncomingWebhookDeliveriesInteractor,
  getPrunePublicFormSubmissionsInteractor,
  getPruneBookingsInteractor,
  getSendNotificationDigestInteractor,
  getPruneDraftSendsInteractor,
  getPurgeExpiredTrashInteractor,
  getPurgeExpiredRecordFilesInteractor,
  getNormalizePhoneIdentitiesInteractor,
  getPruneWikiKnowledgeGapsInteractor,
  getSyncStaleWikiSectionsInteractor,
} from "@/core/di";
import { isUnipileRateLimit, isUnipileTransientError } from "@/ee/messaging/messaging.service";
import { env } from "@/env";

export const runtime = "nodejs";
export const maxDuration = 300;

type LifecycleStep = [name: string, run: () => Promise<unknown>];

function concurrentSteps(): LifecycleStep[] {
  const retention: LifecycleStep[] = [
    ["expireAdAttribution", () => getExpireAdAttributionInteractor().invoke()],
    ["pruneRoutineRuns", () => getPruneRoutineRunsInteractor().invoke()],
    ["pruneAutomationRuleRuns", () => getPruneAutomationRuleRunsInteractor().invoke()],
    ["pruneAgentJobs", () => getPruneAgentJobsInteractor().invoke()],
    ["pruneNotifications", () => getPruneNotificationsInteractor().invoke()],
    ["pruneIncomingWebhookDeliveries", () => getPruneIncomingWebhookDeliveriesInteractor().invoke()],
    ["prunePublicFormSubmissions", () => getPrunePublicFormSubmissionsInteractor().invoke()],
    ["pruneBookings", () => getPruneBookingsInteractor().invoke()],
    ["sendNotificationDigest", () => getSendNotificationDigestInteractor().invoke()],
    ["pruneDraftSends", () => getPruneDraftSendsInteractor().invoke()],
    ["purgeExpiredTrash", () => getPurgeExpiredTrashInteractor().invoke()],
    ["purgeExpiredRecordFiles", () => getPurgeExpiredRecordFilesInteractor().invoke()],
    ["normalizePhoneIdentities", () => getNormalizePhoneIdentitiesInteractor().invoke()],
    ["pruneWikiKnowledgeGaps", () => getPruneWikiKnowledgeGapsInteractor().invoke()],
    [
      "syncStaleWikiSections",
      () =>
        getSyncStaleWikiSectionsInteractor()
          .invoke()
          .catch((error: unknown) => {
            ErrorReporter.captureException(error, { tags: { kind: "wiki-section-cron-sync" } });
          }),
    ],
  ];
  if (env.APP_MODE !== "cloud") return retention;

  const unipile: LifecycleStep[] = env.UNIPILE_API_KEY
    ? [
        [
          "deleteConnectedAccountsForExpiredTrials",
          () => getDeleteConnectedAccountsForExpiredTrialsInteractor().invoke(),
        ],
        [
          "deleteConnectedAccountsForInactiveOwners",
          () => getDeleteConnectedAccountsForInactiveOwnersInteractor().invoke(),
        ],
      ]
    : [];

  return [
    ["sendWelcomeAndDemo", () => getSendWelcomeAndDemoInteractor().invoke()],
    ["sendTrialExtensionOffer", () => getSendTrialExtensionOfferInteractor().invoke()],
    [
      "deactivateUsersAfterSubscriptionGracePeriod",
      () => getDeactivateUsersAfterSubscriptionGracePeriodInteractor().invoke(),
    ],
    ...unipile,
    ["sendLegalDocumentNotices", () => getSendLegalDocumentNoticesInteractor().invoke()],
    ...retention,
  ];
}

type StepFailure = { name: string; error: unknown };

async function failedSteps(steps: LifecycleStep[]): Promise<StepFailure[]> {
  const results = await Promise.allSettled(steps.map(([, run]) => Promise.resolve().then(run)));

  return steps.flatMap(([name], index) => {
    const result = results[index];
    return result.status === "rejected" ? [{ name, error: result.reason }] : [];
  });
}

// A Unipile timeout, outage or rate limit is retried by tomorrow's lifecycle run, so it is a warning, not an error.
function isRetryableUpstreamFailure(error: unknown): boolean {
  return isUnipileTransientError(error) || isUnipileRateLimit(error);
}

function stepFailureSummary({ name, error }: StepFailure): string {
  return `${name} (${error instanceof Error ? error.message : String(error)})`;
}

export async function GET(req: Request) {
  const authorization = req.headers.get("authorization");
  if (!env.CRON_SECRET || authorization !== `Bearer ${env.CRON_SECRET}`)
    return new Response("Unauthorized", { status: 401 });

  if (env.APP_MODE === "demo") return Response.json({ skipped: "demo-mode" });
  if (env.VERCEL_ENV === "preview") return Response.json({ skipped: "preview-environment" });

  const failures = await failedSteps(concurrentSteps());
  if (env.APP_MODE === "cloud" && env.UNIPILE_API_KEY) {
    failures.push(
      ...(await failedSteps([
        ["deleteOrphanedUnipileAccounts", () => getDeleteOrphanedUnipileAccountsInteractor().invoke()],
      ])),
    );
  }

  const retryable = failures.filter(({ error }) => isRetryableUpstreamFailure(error));
  for (const { name, error } of retryable) {
    ErrorReporter.captureException(error, {
      level: "warning",
      tags: { kind: "lifecycle-step", step: name },
    });
  }

  const fatal = failures.filter((failure) => !retryable.includes(failure));

  if (fatal.length) {
    throw new AggregateError(
      fatal.map(({ error }) => error),
      `Lifecycle steps failed: ${fatal.map(stepFailureSummary).join(", ")}`,
    );
  }

  return Response.json({ ok: true });
}
