import type { NextRequest } from "next/server";

import { NextResponse } from "next/server";

import * as Sentry from "@sentry/nextjs";

import { env } from "@/env";
import { getIngestUnipileWebhookInteractor } from "@/core/di";
import { verifyHmacSha256Hex } from "@/core/utils/hmac";

const SIGNATURE_HEADER = "unipile-signature";

const MAX_SKEW_SECONDS = 300;

function parseSignatureHeader(header: string): { t: number; v0: string } | null {
  const parts = header.split(",");
  let timestamp: number | null = null;
  let signature: string | null = null;

  for (const part of parts) {
    const [key, value] = part.split("=", 2);
    if (key === "t" && value) timestamp = Number(value);
    if (key === "v0" && value) signature = value;
  }

  if (timestamp === null || !Number.isFinite(timestamp) || !signature) return null;

  return { t: timestamp, v0: signature };
}

function verifyUnipileSignature(
  rawBody: string,
  signatureHeader: string | null,
  secret: string,
  nowMs: number = Date.now(),
): boolean {
  if (!secret || !signatureHeader) return false;

  const parsed = parseSignatureHeader(signatureHeader);
  if (!parsed) return false;

  const skewSeconds = Math.abs(nowMs / 1000 - parsed.t);
  if (skewSeconds > MAX_SKEW_SECONDS) return false;

  return verifyHmacSha256Hex(secret, `${parsed.t}.${rawBody}`, parsed.v0);
}

export async function POST(request: NextRequest) {
  const raw = await request.text();

  if (!verifyUnipileSignature(raw, request.headers.get(SIGNATURE_HEADER), env.UNIPILE_WEBHOOK_SECRET ?? ""))
    return NextResponse.json({ error: "Invalid signature" }, { status: 401 });

  let body: unknown;
  try {
    body = JSON.parse(raw);
  } catch {
    Sentry.captureException(new Error("Unipile v2 webhook: invalid JSON body"));

    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  await getIngestUnipileWebhookInteractor().invoke(body);

  return NextResponse.json({ ok: true });
}
