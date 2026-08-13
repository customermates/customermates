import type { NextRequest } from "next/server";

import { NextResponse } from "next/server";

import { z } from "zod";

import { getDeleteAccountsForPlanInteractor, getSubscriptionService } from "@/core/di";
import { verifyHmacSha256Hex } from "@/core/utils/hmac";
import { env } from "@/env";

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
      data: z.looseObject({ id: z.string().min(1) }),
      meta: z.looseObject({ custom_data: z.looseObject({ company_id: z.string().min(1) }).nullish() }),
    })
    .parse(JSON.parse(body));

  const { companyId, changedPlan } = await getSubscriptionService().updateSubscriptionOrThrow(
    payload.data.id,
    payload.meta.custom_data?.company_id,
  );

  if (changedPlan) await getDeleteAccountsForPlanInteractor().invoke({ companyId, plan: changedPlan });

  return NextResponse.json({ success: true });
}
