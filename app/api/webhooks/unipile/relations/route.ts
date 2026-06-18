import type { NextRequest } from "next/server";

import { NextResponse } from "next/server";

import { UnipileWebhookSource } from "@/generated/prisma";
import { getUnipileWebhookIngestService } from "@/core/di";
import { UNIPILE_AUTH_HEADER, verifyUnipileWebhookSignature } from "@/ee/messaging/webhook-signature";
import { parseWebhookJson } from "@/ee/messaging/webhooks/parse-webhook-json";

export async function POST(request: NextRequest) {
  if (!verifyUnipileWebhookSignature(request.headers.get(UNIPILE_AUTH_HEADER)))
    return NextResponse.json({ error: "Invalid signature" }, { status: 401 });

  const parsed = await parseWebhookJson(request, "users");
  if (!parsed.ok) return parsed.response;

  await getUnipileWebhookIngestService().ingest(UnipileWebhookSource.users, parsed.payload);

  return NextResponse.json({ ok: true });
}
