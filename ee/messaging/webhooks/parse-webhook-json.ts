import { NextResponse } from "next/server";

import * as Sentry from "@sentry/nextjs";

export async function parseWebhookJson(
  request: Request,
  source: string,
): Promise<{ ok: true; payload: unknown } | { ok: false; response: NextResponse }> {
  try {
    return { ok: true, payload: await request.json() };
  } catch {
    Sentry.captureException(new Error(`Unipile ${source} webhook: invalid JSON body`));

    return { ok: false, response: NextResponse.json({ error: "Invalid JSON" }, { status: 400 }) };
  }
}
