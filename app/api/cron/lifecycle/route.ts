import {
  getDeactivateTrialUsersAndSendNoticeInteractor,
  getDeactivateUsersAfterSubscriptionGracePeriodInteractor,
  getSendTrialExtensionOfferInteractor,
  getSendTrialInactivationReminderInteractor,
  getSendWelcomeAndDemoInteractor,
  getDeleteConnectedAccountsForExpiredTrialsInteractor,
  getDeleteConnectedAccountsForInactiveOwnersInteractor,
  getDeleteOrphanedUnipileAccountsInteractor,
  getExpireAdAttributionInteractor,
  getSendLegalDocumentNoticesInteractor,
  getPruneRoutineRunsInteractor,
  getPurgeExpiredTrashInteractor,
} from "@/core/di";
import { env } from "@/env";

export const runtime = "nodejs";
export const maxDuration = 300;

type LifecycleStep = [name: string, run: () => Promise<unknown>];

function concurrentSteps(): LifecycleStep[] {
  const retention: LifecycleStep[] = [
    ["expireAdAttribution", () => getExpireAdAttributionInteractor().invoke()],
    ["pruneRoutineRuns", () => getPruneRoutineRunsInteractor().invoke()],
    ["purgeExpiredTrash", () => getPurgeExpiredTrashInteractor().invoke()],
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
    ["sendTrialInactivationReminder", () => getSendTrialInactivationReminderInteractor().invoke()],
    ["deactivateTrialUsersAndSendNotice", () => getDeactivateTrialUsersAndSendNoticeInteractor().invoke()],
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

  if (failures.length) {
    throw new AggregateError(
      failures.map(({ error }) => error),
      `Lifecycle steps failed: ${failures.map(stepFailureSummary).join(", ")}`,
    );
  }

  return Response.json({ ok: true });
}
