import { NextResponse } from "next/server";

import { handleError, interactorFailureResponse } from "@/core/api/structured-interactor-handler";
import { getSetNotificationKindOffInteractor } from "@/core/di";
import { absoluteWorkspaceUrl } from "@/core/navigation/workspace-paths";
import { env } from "@/env";
import { NOTIFICATION_KIND_OFF_NOTICE } from "@/features/notifications/notification.schema";

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

export async function GET(request: Request) {
  try {
    const token = new URL(request.url).searchParams.get("token") ?? "";
    const result = await getSetNotificationKindOffInteractor().invoke({ token });
    if (!result.ok) {
      const response = interactorFailureResponse(result.error);
      for (const [name, value] of Object.entries(PRIVATE_HEADERS)) response.headers.set(name, value);
      return response;
    }
    const outcome = result.data;
    if (outcome.status === "invalid") return text("This link is not valid.", 400);
    if (outcome.status === "expired") return text("This link has expired.", 410);
    const { kind, locale, workspaceSlug } = outcome;
    const query = new URLSearchParams({ notice: NOTIFICATION_KIND_OFF_NOTICE, kind }).toString();
    const target = `${absoluteWorkspaceUrl(env.BASE_URL, locale, workspaceSlug, "/settings/profile")}?${query}`;
    return NextResponse.redirect(target, { status: 303, headers: PRIVATE_HEADERS });
  } catch (error) {
    return handleError(error);
  }
}
