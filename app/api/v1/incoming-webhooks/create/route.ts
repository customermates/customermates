import type { NextRequest } from "next/server";

import { handleIncomingWebhookRoute } from "../incoming-webhook-route";

export function POST(request: NextRequest) {
  return handleIncomingWebhookRoute(request, "create");
}
