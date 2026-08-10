import "server-only";

import { redirect } from "next/navigation";
import { getLocale } from "next-intl/server";

import { getAuthService, getRouteGuardService } from "@/core/di";
import { buildLocalePath } from "@/i18n/locale-registry";
import { isRedirect } from "../auth-outcome";
import { accountStateRedirect } from "../account-state";
import { accessRedirectForAccountState, unauthenticatedRedirectForAccountState } from "../route-guard.service";
import { resolveDefaultAccountState } from "./resolve-account-state";

import type { AccountState } from "../account-state";
import type { AccessOptions, AccountStateResolution } from "../route-guard.service";

export async function requireAccess(options?: AccessOptions): Promise<void> {
  const hasAlternateAccountStatePolicy =
    options?.skipOnboardingWizardCheck || options?.skipLegalAcceptanceCheck || options?.skipSubscriptionCheck;
  const result = hasAlternateAccountStatePolicy
    ? await getRouteGuardService().resolveAccess(options)
    : accessRedirectForAccountState(await resolveDefaultAccountState(), options);
  if (result) redirect(buildLocalePath(await getLocale(), result.redirect));
}

export async function requireUnauthenticated(): Promise<void> {
  const result = unauthenticatedRedirectForAccountState(await resolveDefaultAccountState());
  if (result) redirect(buildLocalePath(await getLocale(), result.redirect));
}

export async function requireAccountState(
  expected: AccountState | readonly AccountState[],
  fallback = "/",
): Promise<AccountStateResolution> {
  const result = await resolveDefaultAccountState();
  const expectedStates: readonly AccountState[] = Array.isArray(expected) ? expected : [expected];
  if (expectedStates.includes(result.state)) return result;

  redirect(buildLocalePath(await getLocale(), accountStateRedirect(result.state) ?? fallback));
}

export async function requireSession() {
  const result = await getAuthService().resolveSession();
  if (isRedirect(result)) redirect(buildLocalePath(await getLocale(), result.redirect));
  return result.session;
}
