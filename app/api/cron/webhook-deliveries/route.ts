import { NextResponse } from "next/server";

import { di } from "@/core/dependency-injection/container";
import { ProcessWebhookDeliveriesInteractor } from "@/features/webhook/process-webhook-deliveries.interactor";

export async function GET(request: Request) {
  const authHeader = request.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;

  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  await di.get(ProcessWebhookDeliveriesInteractor).invoke();

  return new NextResponse("ok");
}
