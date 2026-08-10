import "server-only";

import { redirect } from "next/navigation";
import { getLocale } from "next-intl/server";

import { getAuthService, getRouteGuardService } from "@/core/di";
import { buildLocalePath } from "@/i18n/locale-registry";
import { isRedirect } from "../auth-outcome";

import type { AccessOptions } from "../route-guard.service";

export async function requireAccess(options?: AccessOptions): Promise<void> {
  const result = await getRouteGuardService().resolveAccess(options);
  if (result) redirect(buildLocalePath(await getLocale(), result.redirect));
}

export async function requireUnauthenticated(): Promise<void> {
  const result = await getRouteGuardService().resolveUnauthenticated();
  if (result) redirect(buildLocalePath(await getLocale(), result.redirect));
}

export async function requireSession() {
  const result = await getAuthService().resolveSession();
  if (isRedirect(result)) redirect(buildLocalePath(await getLocale(), result.redirect));
  return result.session;
}
