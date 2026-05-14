import "server-only";

import { redirect } from "next/navigation";

import { getAuthService, getRouteGuardService } from "@/core/app-di";
import { isRedirect } from "../auth-outcome";

import type { AccessOptions } from "../route-guard.service";

export async function requireAccess(options?: AccessOptions): Promise<void> {
  const result = await getRouteGuardService().resolveAccess(options);
  if (result) redirect(result.redirect);
}

export async function requireUnauthenticated(): Promise<void> {
  const result = await getRouteGuardService().resolveUnauthenticated();
  if (result) redirect(result.redirect);
}

export async function requireSession() {
  const result = await getAuthService().resolveSession();
  if (isRedirect(result)) redirect(result.redirect);
  return result.session;
}
