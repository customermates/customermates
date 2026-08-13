import type { NextRequest } from "next/server";

import * as Sentry from "@sentry/nextjs";
import { NextResponse } from "next/server";

import { z } from "zod";

import { getDeleteAccountsForPlanInteractor, getSubscriptionService } from "@/core/di";
import { verifyHmacSha256Hex } from "@/core/utils/hmac";
import { env } from "@/env";

const SUBSCRIPTION_EVENTS = [
  "subscription_created",
  "subscription_updated",
  "subscription_cancelled",
  "subscription_resumed",
  "subscription_expired",
  "subscription_paused",
  "subscription_unpaused",
] as const;

export async function POST(request: NextRequest) {
  const signature = request.headers.get("x-signature");
  if (!signature) return NextResponse.json({ error: "Missing signature" }, { status: 401 });

  const body = await request.text();

  const secret = env.LEMONSQUEEZY_WEBHOOK_SECRET;
  if (!secret) throw new Error("LEMONSQUEEZY_WEBHOOK_SECRET is not configured");

  if (!verifyHmacSha256Hex(secret, body, signature))
    return NextResponse.json({ error: "Invalid signature" }, { status: 401 });

  const payload = z
    .looseObject({
      data: z.looseObject({
        id: z.string().min(1),
        type: z.string().min(1),
      }),
      meta: z.looseObject({
        event_name: z.string().min(1),
        custom_data: z
          .looseObject({
            company_id: z.uuid(),
            checkout_token: z
              .string()
              .regex(/^[a-f\d]{64}$/i)
              .nullish(),
          })
          .nullish(),
      }),
    })
    .parse(JSON.parse(body));

  if (
    payload.data.type !== "subscriptions" ||
    !SUBSCRIPTION_EVENTS.includes(payload.meta.event_name as (typeof SUBSCRIPTION_EVENTS)[number])
  )
    return NextResponse.json({ success: true, ignored: true });

  const { companyId, changedPlan, disposition } = await getSubscriptionService().updateSubscriptionOrThrow(
    payload.data.id,
    payload.meta.custom_data?.company_id,
    payload.meta.custom_data?.checkout_token ?? undefined,
  );

  if (disposition !== "updated") {
    Sentry.captureMessage("Ignored Lemon Squeezy webhook that was not authorized to change the billing binding", {
      level: "warning",
      tags: { disposition },
    });
    return NextResponse.json({ success: true, ignored: true });
  }

  if (changedPlan) {
    await getDeleteAccountsForPlanInteractor().invoke({
      companyId,
      plan: changedPlan,
    });
  }

  return NextResponse.json({ success: true });
}
