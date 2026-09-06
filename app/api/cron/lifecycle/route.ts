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
  getAnalyzeCompanyRoutinesInteractor,
  getPruneRoutineRunsInteractor,
} from "@/core/di";
import { env } from "@/env";

export const runtime = "nodejs";
export const maxDuration = 300;

export async function GET(req: Request) {
  const authorization = req.headers.get("authorization");
  if (!env.CRON_SECRET || authorization !== `Bearer ${env.CRON_SECRET}`)
    return new Response("Unauthorized", { status: 401 });

  if (env.APP_MODE === "demo") return Response.json({ skipped: "demo-mode" });
  if (env.VERCEL_ENV === "preview") return Response.json({ skipped: "preview-environment" });

  await Promise.all([
    getSendWelcomeAndDemoInteractor().invoke(),
    getSendTrialExtensionOfferInteractor().invoke(),
    getSendTrialInactivationReminderInteractor().invoke(),
    getDeactivateTrialUsersAndSendNoticeInteractor().invoke(),
    getDeactivateUsersAfterSubscriptionGracePeriodInteractor().invoke(),
    getDeleteConnectedAccountsForExpiredTrialsInteractor().invoke(),
    getDeleteConnectedAccountsForInactiveOwnersInteractor().invoke(),
    getExpireAdAttributionInteractor().invoke(),
    getSendLegalDocumentNoticesInteractor().invoke(),
    getAnalyzeCompanyRoutinesInteractor().invoke(),
    getPruneRoutineRunsInteractor().invoke(),
  ]);

  await getDeleteOrphanedUnipileAccountsInteractor().invoke();

  return Response.json({ ok: true });
}
