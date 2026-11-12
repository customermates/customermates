import type { NextRequest } from "next/server";

import { createHash } from "node:crypto";

import { NextResponse } from "next/server";

import { getReceiveIncomingWebhookInteractor } from "@/core/di";
import { INCOMING_WEBHOOK_LIMITS } from "@/features/incoming-webhook/incoming-webhook.schema";

export const dynamic = "force-dynamic";

type Context = { params: Promise<{ token: string }> };

function visitorOf(request: NextRequest): string | null {
  const forwarded = request.headers
    .get("x-forwarded-for")
    ?.split(",")
    .map((entry) => entry.trim())
    .filter(Boolean);
  const address =
    request.headers.get("x-vercel-forwarded-for")?.trim() || request.headers.get("x-real-ip")?.trim() || forwarded?.at(-1);
  return address ? createHash("sha256").update(address).digest("hex").slice(0, 32) : null;
}

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
  const body = await readBody(request);
  if (body === null) return NextResponse.json({ ok: false, error: "payload_too_large" }, { status: 413 });

  const result = await getReceiveIncomingWebhookInteractor().invoke({
    token,
    body,
    header: (name) => request.headers.get(name),
    visitor: visitorOf(request),
  });
  return NextResponse.json(result.body, {
    status: result.status,
    ...(result.retryAfterSeconds ? { headers: { "Retry-After": String(result.retryAfterSeconds) } } : {}),
  });
}
