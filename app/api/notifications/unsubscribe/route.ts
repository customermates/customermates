import { NextResponse } from "next/server";

import { handleError } from "@/core/api/structured-interactor-handler";
import { getSetNotificationKindOffInteractor } from "@/core/di";
import { absoluteWorkspaceUrl } from "@/core/navigation/workspace-paths";
import { env } from "@/env";
import { NOTIFICATION_KIND_OFF_NOTICE, NOTIFICATION_TURN_OFF_PATH } from "@/features/notifications/notification.schema";
import { browserAppLocale } from "@/i18n/locale-preference";
import { buildLocalePath } from "@/i18n/locale-registry";

export const dynamic = "force-dynamic";

const TOKEN_MAX_CHARS = 256;

const PRIVATE_HEADERS = {
  "Cache-Control": "private, no-store",
  "Referrer-Policy": "no-referrer",
  "X-Robots-Tag": "noindex, nofollow",
};

function turnOffPage(locale: string, token: string): string {
  const query = token && token.length <= TOKEN_MAX_CHARS ? `?${new URLSearchParams({ token }).toString()}` : "";
  return `${env.BASE_URL.replace(/\/+$/u, "")}${buildLocalePath(locale, NOTIFICATION_TURN_OFF_PATH)}${query}`;
}

function requestLocale(request: Request): string {
  const languages = (request.headers.get("accept-language") ?? "")
    .split(",")
    .map((entry) => {
      const [tag, ...parameters] = entry.trim().split(";");
      const quality = parameters.map((parameter) => /^\s*q=([\d.]+)\s*$/u.exec(parameter)?.[1]).find(Boolean);
      return { tag: tag.trim(), quality: quality === undefined ? 1 : Number(quality) };
    })
    .filter((entry) => entry.tag !== "" && entry.quality > 0)
    .sort((left, right) => right.quality - left.quality)
    .map((entry) => entry.tag);
  return browserAppLocale(languages);
}

async function respond(request: Request, token: string, confirmed: boolean) {
  const result = await getSetNotificationKindOffInteractor().invoke({ token, confirmed });
  const outcome = result.ok ? result.data : { status: "invalid" as const };
  if (outcome.status === "invalid" || outcome.status === "expired")
    return NextResponse.redirect(turnOffPage(requestLocale(request), token), { status: 303, headers: PRIVATE_HEADERS });
  const { kind, locale, status, viewerIsMember, workspaceSlug } = outcome;
  const target =
    confirmed && status === "off" && viewerIsMember
      ? `${absoluteWorkspaceUrl(env.BASE_URL, locale, workspaceSlug, "/settings/profile")}?${new URLSearchParams({
          notice: NOTIFICATION_KIND_OFF_NOTICE,
          kind,
        }).toString()}`
      : turnOffPage(locale, token);
  return NextResponse.redirect(target, { status: 303, headers: PRIVATE_HEADERS });
}

export async function GET(request: Request) {
  try {
    return await respond(request, new URL(request.url).searchParams.get("token") ?? "", false);
  } catch (error) {
    return handleError(error);
  }
}

export async function POST(request: Request) {
  try {
    const form = await request.formData().catch(() => null);
    const token = form?.get("token");
    return await respond(request, typeof token === "string" ? token : "", true);
  } catch (error) {
    return handleError(error);
  }
}
