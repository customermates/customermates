import {
  getNotifyRunnerOfflineInteractor,
  getSendBookingRemindersInteractor,
  getSendInstantNotificationFallbackInteractor,
  getSweepAgentJobTimeoutsInteractor,
  getSweepAutomationRulesInteractor,
  getSweepRecordDeliveriesInteractor,
  getSweepRecordFileIndexInteractor,
} from "@/core/di";
import { env } from "@/env";

export const runtime = "nodejs";
export const maxDuration = 300;

type SweepStep = [name: string, run: () => Promise<Record<string, number>>];

async function agentJobsThenRunnerNotice(): Promise<Record<string, number>> {
  const jobs = await getSweepAgentJobTimeoutsInteractor().invoke();
  return { ...jobs, ...(await getNotifyRunnerOfflineInteractor().invoke()) };
}

function sweepSteps(): SweepStep[] {
  return [
    ["recordDeliveries", () => getSweepRecordDeliveriesInteractor().invoke()],
    ["recordFileIndex", () => getSweepRecordFileIndexInteractor().invoke()],
    ["automationRules", () => getSweepAutomationRulesInteractor().invoke()],
    ["agentJobs", agentJobsThenRunnerNotice],
    ["instantNotificationFallback", () => getSendInstantNotificationFallbackInteractor().invoke()],
    ...(env.APP_MODE === "cloud"
      ? ([["bookingReminders", () => getSendBookingRemindersInteractor().invoke()]] satisfies SweepStep[])
      : []),
  ];
}

export async function GET(req: Request) {
  const authorization = req.headers.get("authorization");
  if (!env.CRON_SECRET || authorization !== `Bearer ${env.CRON_SECRET}`)
    return new Response("Unauthorized", { status: 401 });

  if (env.APP_MODE === "demo") return Response.json({ skipped: "demo-mode" });
  if (env.VERCEL_ENV === "preview") return Response.json({ skipped: "preview-environment" });

  const steps = sweepSteps();
  const results = await Promise.allSettled(steps.map(([, run]) => Promise.resolve().then(run)));
  const counts: Record<string, number> = {};
  const failures: Array<{ name: string; error: unknown }> = [];
  results.forEach((result, index) => {
    if (result.status === "fulfilled") Object.assign(counts, result.value);
    else failures.push({ name: steps[index][0], error: result.reason });
  });

  if (failures.length) {
    throw new AggregateError(
      failures.map(({ error }) => error),
      `Sweeps failed: ${failures
        .map(({ name, error }) => `${name} (${error instanceof Error ? error.message : String(error)})`)
        .join(", ")}`,
    );
  }

  return Response.json({ ok: true, ...counts });
}
