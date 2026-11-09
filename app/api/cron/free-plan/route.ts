import { getSyncFreePlanPausesInteractor } from "@/core/di";
import { env } from "@/env";

export const runtime = "nodejs";
export const maxDuration = 300;

export async function GET(req: Request) {
  const authorization = req.headers.get("authorization");
  if (!env.CRON_SECRET || authorization !== `Bearer ${env.CRON_SECRET}`)
    return new Response("Unauthorized", { status: 401 });

  if (env.APP_MODE !== "cloud") return Response.json({ skipped: env.APP_MODE });
  if (env.VERCEL_ENV === "preview") return Response.json({ skipped: "preview-environment" });

  const companyId = new URL(req.url).searchParams.get("companyId");
  const result = await getSyncFreePlanPausesInteractor().invoke({ companyIds: companyId ? [companyId] : undefined });

  return Response.json({ ok: true, ...result });
}
