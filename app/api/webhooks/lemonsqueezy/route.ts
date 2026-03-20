import type { NextRequest } from "next/server";

import { NextResponse } from "next/server";

import { di } from "@/core/dependency-injection/container";
import { SubscriptionService } from "@/ee/subscription/subscription.service";

export async function POST(request: NextRequest) {
  const signature = request.headers.get("x-signature");
  if (!signature) return NextResponse.json({ error: "Missing signature" }, { status: 401 });

  const body = await request.text();

  if (!di.get(SubscriptionService).verifyWebhookSignatureOrThrow(body, signature))
    return NextResponse.json({ error: "Invalid signature" }, { status: 401 });

  const payload = JSON.parse(body);
  await di.get(SubscriptionService).updateSubscriptionOrThrow(payload.data.id, payload.meta.custom_data?.company_id);

  return NextResponse.json({ success: true });
}
