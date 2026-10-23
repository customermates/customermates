import "server-only";

import * as Sentry from "@sentry/nextjs";
import { redirect } from "next/navigation";

import { accountStateRedirect } from "../account-state";
import { accessRedirectForAccountState, unauthenticatedRedirectForAccountState } from "../route-guard.service";
import { resolveRequestAccountState } from "./resolve-account-state";
import { appRedirectHref } from "./app-redirect";

import type { AccountState } from "../account-state";
import type { AccessOptions, AccountStateResolution } from "../route-guard.service";

async function identifyViewerForSentry(): Promise<void> {
  const { user } = await resolveRequestAccountState();

  Sentry.setUser(user ? { id: user.id } : null);
  Sentry.setTag("companyId", user?.companyId);
}

export async function requireAccess(options?: AccessOptions): Promise<void> {
  await identifyViewerForSentry();

  const result = accessRedirectForAccountState(await resolveRequestAccountState(), options);
  if (result) redirect(await appRedirectHref(result.redirect));
}

export async function requireUnauthenticated(): Promise<void> {
  const result = unauthenticatedRedirectForAccountState(await resolveRequestAccountState());
  if (result) redirect(await appRedirectHref(result.redirect));
}

export async function requireAccountState(
  expected: AccountState | readonly AccountState[],
  fallback = "/",
  redirectOverrides: Partial<Record<AccountState, string>> = {},
): Promise<AccountStateResolution> {
  const result = await resolveRequestAccountState();
  const expectedStates: readonly AccountState[] = Array.isArray(expected) ? expected : [expected];
  if (expectedStates.includes(result.state)) return result;

  redirect(await appRedirectHref(redirectOverrides[result.state] ?? accountStateRedirect(result.state) ?? fallback));
}
