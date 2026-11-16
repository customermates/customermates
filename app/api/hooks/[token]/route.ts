import type { NextRequest } from "next/server";

import { NextResponse } from "next/server";

import { getReceiveIncomingWebhookInteractor } from "@/core/di";
import { visitorKey } from "@/core/network/visitor-key";
import { INCOMING_WEBHOOK_LIMITS } from "@/features/incoming-webhook/incoming-webhook.schema";

export const dynamic = "force-dynamic";

type Context = { params: Promise<{ token: string }> };

async function readBody(request: NextRequest): Promise<string | null> {
  const limit = INCOMING_WEBHOOK_LIMITS.maxBodyBytes;
  const declared = Number(request.headers.get("content-length") ?? "0");
  if (Number.isFinite(declared) && declared > limit) return null;
  const reader = request.body?.getReader();
  if (!reader) return "";
  const merged = new Uint8Array(limit);
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    if (size + value.byteLength > limit) {
      await reader.cancel();
      return null;
    }
    merged.set(value, size);
    size += value.byteLength;
  }
  return new TextDecoder().decode(merged.subarray(0, size));
}

export async function POST(request: NextRequest, { params }: Context) {
  const { token } = await params;

  const result = await getReceiveIncomingWebhookInteractor().invoke({
    token,
    readBody: () => readBody(request),
    header: (name) => request.headers.get(name),
    visitor: await visitorKey(request),
  });
  return NextResponse.json(result.body, {
    status: result.status,
    ...(result.retryAfterSeconds ? { headers: { "Retry-After": String(result.retryAfterSeconds) } } : {}),
  });
}
