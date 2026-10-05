import { NextResponse } from "next/server";

import { resolveRequestOrigin } from "@/core/config/environment";
import { env } from "@/env";
import { buildLocalePath } from "@/i18n/locale-registry";

export async function GET(request: Request, context: { params: Promise<{ locale: string }> }) {
  const { locale } = await context.params;
  const base = resolveRequestOrigin(request.url, env.AUTH_ALLOWED_HOSTS, env.BASE_URL);
  const target = new URL(buildLocalePath(locale, "/configure"), base);
  target.search = new URL(request.url).search;
  return NextResponse.redirect(target, 308);
}
