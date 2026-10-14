import { getSweepRecordDeliveriesInteractor } from "@/core/di";
import { env } from "@/env";

export const runtime = "nodejs";
export const maxDuration = 300;

export async function GET(req: Request) {
  const authorization = req.headers.get("authorization");
  if (!env.CRON_SECRET || authorization !== `Bearer ${env.CRON_SECRET}`)
    return new Response("Unauthorized", { status: 401 });

  if (env.APP_MODE === "demo") return Response.json({ skipped: "demo-mode" });
  if (env.VERCEL_ENV === "preview") return Response.json({ skipped: "preview-environment" });

  return Response.json({
    ok: true,
    ...(await getSweepRecordDeliveriesInteractor().invoke()),
  });
}
