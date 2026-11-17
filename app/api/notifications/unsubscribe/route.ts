import { NextResponse } from "next/server";

import { handleError, interactorFailureResponse } from "@/core/api/structured-interactor-handler";
import { getSetNotificationKindOffInteractor } from "@/core/di";
import { absoluteWorkspaceUrl } from "@/core/navigation/workspace-paths";
import { env } from "@/env";
import { NOTIFICATION_KIND_OFF_NOTICE, NOTIFICATION_TURN_OFF_PATH } from "@/features/notifications/notification.schema";

export const dynamic = "force-dynamic";

const PRIVATE_HEADERS = {
  "Cache-Control": "private, no-store",
  "Referrer-Policy": "no-referrer",
  "X-Robots-Tag": "noindex, nofollow",
};

function text(message: string, status: number) {
  return new Response(message, {
    status,
    headers: { ...PRIVATE_HEADERS, "Content-Type": "text/plain; charset=utf-8" },
  });
}

async function respond(token: string, confirmed: boolean) {
  const result = await getSetNotificationKindOffInteractor().invoke({ token, confirmed });
  if (!result.ok) {
    const response = interactorFailureResponse(result.error);
    for (const [name, value] of Object.entries(PRIVATE_HEADERS)) response.headers.set(name, value);
    return response;
  }
  const outcome = result.data;
  if (outcome.status === "invalid") return text("This link is not valid.", 400);
  if (outcome.status === "expired") return text("This link has expired.", 410);
  const { kind, locale, status, workspaceSlug } = outcome;
  const target =
    status === "off"
      ? `${absoluteWorkspaceUrl(env.BASE_URL, locale, workspaceSlug, "/settings/profile")}?${new URLSearchParams({
          notice: NOTIFICATION_KIND_OFF_NOTICE,
          kind,
        }).toString()}`
      : `${env.BASE_URL.replace(/\/+$/u, "")}/${locale}${NOTIFICATION_TURN_OFF_PATH}?${new URLSearchParams({
          token,
        }).toString()}`;
  return NextResponse.redirect(target, { status: 303, headers: PRIVATE_HEADERS });
}

export async function GET(request: Request) {
  try {
    return await respond(new URL(request.url).searchParams.get("token") ?? "", false);
  } catch (error) {
    return handleError(error);
  }
}

export async function POST(request: Request) {
  try {
    const form = await request.formData().catch(() => null);
    const token = form?.get("token");
    return await respond(typeof token === "string" ? token : "", true);
  } catch (error) {
    return handleError(error);
  }
}
