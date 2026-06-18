import type { NextRequest } from "next/server";

import { NextResponse } from "next/server";

import { UnipileWebhookSource } from "@/generated/prisma";
import { getUnipileWebhookIngestService } from "@/core/di";
import { verifyHostedAuthToken } from "@/ee/messaging/webhook-signature";

export async function POST(request: NextRequest) {
  let rawPayload: unknown;
  try {
    rawPayload = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const name = (rawPayload as { name?: unknown } | null)?.name;
  const token = request.nextUrl.searchParams.get("token");

  if (typeof name !== "string" || !verifyHostedAuthToken(name, token))
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  await getUnipileWebhookIngestService().ingest(UnipileWebhookSource.account_callback, rawPayload);

  return NextResponse.json({ ok: true });
}
