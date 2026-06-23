import { getReprocessStuckWebhookEventsInteractor } from "@/core/di";
import { env } from "@/env";

export const runtime = "nodejs";
export const maxDuration = 300;

export async function GET(req: Request) {
  const authorization = req.headers.get("authorization");
  if (!env.CRON_SECRET || authorization !== `Bearer ${env.CRON_SECRET}`)
    return new Response("Unauthorized", { status: 401 });

  if (env.DEMO_MODE) return Response.json({ skipped: "demo-mode" });

  await getReprocessStuckWebhookEventsInteractor().invoke();

  return Response.json({ ok: true });
}
