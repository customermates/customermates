import type { NextRequest } from "next/server";

import { NextResponse } from "next/server";

import { z } from "zod";

import { getProcessLemonSqueezyWebhookInteractor } from "@/core/di";
import { verifyHmacSha256Hex } from "@/core/utils/hmac";
import { env } from "@/env";

const EventSchema = z.looseObject({
  data: z.looseObject({
    type: z.string().optional(),
    id: z.string().min(1),
    attributes: z
      .looseObject({
        created_at: z.string().nullish().catch(null),
        subscription_id: z
          .union([z.number().int().positive(), z.string().regex(/^[1-9]\d{0,19}$/)])
          .nullish()
          .catch(null),
      })
      .nullish(),
  }),
  meta: z.looseObject({
    event_name: z.string().min(1).catch("unknown"),
    custom_data: z
      .looseObject({
        company_id: z.string().min(1).max(200).optional().catch(undefined),
        company_signature: z.unknown(),
      })
      .nullish()
      .catch(null),
  }),
});

function claimedSignature(value: unknown): string | null {
  if (value === undefined || value === null) return null;
  return typeof value === "string" ? value.slice(0, 200) : "";
}

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
  const eventName = payload.meta.event_name;
  const customData = payload.meta.custom_data;
  const claim = customData?.company_id
    ? { companyId: customData.company_id, signature: claimedSignature(customData.company_signature) }
    : null;

  const paidSubscriptionId = payload.data.attributes?.subscription_id;
  if (
    payload.data.type === "subscription-invoices" &&
    eventName === "subscription_payment_success" &&
    paidSubscriptionId
  ) {
    await getProcessLemonSqueezyWebhookInteractor().invoke({
      kind: "payment",
      eventName,
      subscriptionId: String(paidSubscriptionId),
      subscriptionCreatedAt: null,
      claim,
    });
    return NextResponse.json({ ignored: true });
  }
  if (payload.data.type !== undefined && payload.data.type !== "subscriptions")
    return NextResponse.json({ ignored: true });

  const outcome = await getProcessLemonSqueezyWebhookInteractor().invoke({
    kind: "subscription",
    eventName,
    subscriptionId: payload.data.id,
    subscriptionCreatedAt: parseCreatedAt(payload.data.attributes?.created_at),
    claim,
  });
  if (outcome === "refused") return NextResponse.json({ refused: true });
  if (outcome === "ignored") return NextResponse.json({ ignored: true });

  return NextResponse.json({ success: true });
}
