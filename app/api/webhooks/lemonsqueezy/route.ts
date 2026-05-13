import type { NextRequest } from "next/server";

import { NextResponse } from "next/server";

import { getSubscriptionService } from "@/core/app-di";

export async function POST(request: NextRequest) {
  const signature = request.headers.get("x-signature");
  if (!signature) return NextResponse.json({ error: "Missing signature" }, { status: 401 });

  const body = await request.text();

  if (!getSubscriptionService().verifyWebhookSignatureOrThrow(body, signature))
    return NextResponse.json({ error: "Invalid signature" }, { status: 401 });

  const payload = JSON.parse(body);
  await getSubscriptionService().updateSubscriptionOrThrow(payload.data.id, payload.meta.custom_data?.company_id);

  return NextResponse.json({ success: true });
}
