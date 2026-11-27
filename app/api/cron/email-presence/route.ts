import { getDispatchEmailPresenceSweepsInteractor } from "@/core/di";
import { env } from "@/env";

export const runtime = "nodejs";
export const maxDuration = 300;

export async function GET(req: Request) {
  const authorization = req.headers.get("authorization");
  if (!env.CRON_SECRET || authorization !== `Bearer ${env.CRON_SECRET}`)
    return new Response("Unauthorized", { status: 401 });

  if (env.APP_MODE === "demo") return Response.json({ skipped: "demo-mode" });
  if (!env.UNIPILE_API_KEY) return Response.json({ skipped: "messaging-not-configured" });

  const sweeps = await getDispatchEmailPresenceSweepsInteractor().invoke();

  return Response.json({ ok: true, sweeps });
}
