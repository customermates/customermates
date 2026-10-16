import type { NextRequest } from "next/server";

import { NextResponse } from "next/server";

import { z } from "zod";

import { getProcessLemonSqueezyWebhookInteractor } from "@/core/di";
import { verifyHmacSha256Hex } from "@/core/utils/hmac";
import { env } from "@/env";

const ClaimField = z.string().min(1).max(200).optional().catch(undefined);

const EventSchema = z.looseObject({
  data: z.looseObject({
    type: z.string().optional(),
    id: z.string().min(1),
    attributes: z.looseObject({ created_at: z.string().nullish().catch(null) }).nullish(),
  }),
  meta: z.looseObject({
    event_name: z.string().min(1).catch("unknown"),
    custom_data: z.looseObject({ company_id: ClaimField, company_signature: ClaimField }).nullish().catch(null),
  }),
});

function parseCreatedAt(value: string | null | undefined): Date | null {
  const date = value ? new Date(value) : null;
  return date && !Number.isNaN(date.getTime()) ? date : null;
}

export async function POST(request: NextRequest) {
  const signature = request.headers.get("x-signature");
  if (!signature) return NextResponse.json({ error: "Missing signature" }, { status: 401 });

  const body = await request.text();

  const secret = env.LEMONSQUEEZY_WEBHOOK_SECRET;
  if (!secret) throw new Error("LEMONSQUEEZY_WEBHOOK_SECRET is not configured");

  if (!verifyHmacSha256Hex(secret, body, signature))
    return NextResponse.json({ error: "Invalid signature" }, { status: 401 });

  const payload = EventSchema.parse(JSON.parse(body));
  if (payload.data.type !== undefined && payload.data.type !== "subscriptions")
    return NextResponse.json({ ignored: true });

  const customData = payload.meta.custom_data;
  const result = await getProcessLemonSqueezyWebhookInteractor().invoke({
    eventName: payload.meta.event_name,
    subscriptionId: payload.data.id,
    subscriptionCreatedAt: parseCreatedAt(payload.data.attributes?.created_at),
    claim: customData?.company_id
      ? { companyId: customData.company_id, signature: customData.company_signature ?? null }
      : null,
  });
  if (!result.applied) return NextResponse.json({ error: "Unknown workspace" }, { status: 404 });

  return NextResponse.json({ success: true });
}
