import "server-only";

import { redirect } from "next/navigation";
import { getLocale } from "next-intl/server";

import { buildLocalePath } from "@/i18n/locale-registry";
import { accountStateRedirect } from "../account-state";
import { accessRedirectForAccountState, unauthenticatedRedirectForAccountState } from "../route-guard.service";
import { resolveRequestAccountState } from "./resolve-account-state";

import type { AccountState } from "../account-state";
import type { AccessOptions, AccountStateResolution } from "../route-guard.service";

export async function requireAccess(options?: AccessOptions): Promise<void> {
  const result = accessRedirectForAccountState(await resolveRequestAccountState(), options);
  if (result) redirect(buildLocalePath(await getLocale(), result.redirect));
}

export async function requireUnauthenticated(): Promise<void> {
  const result = unauthenticatedRedirectForAccountState(await resolveRequestAccountState());
  if (result) redirect(buildLocalePath(await getLocale(), result.redirect));
}

export async function requireAccountState(
  expected: AccountState | readonly AccountState[],
  fallback = "/",
): Promise<AccountStateResolution> {
  const result = await resolveRequestAccountState();
  const expectedStates: readonly AccountState[] = Array.isArray(expected) ? expected : [expected];
  if (expectedStates.includes(result.state)) return result;

  redirect(buildLocalePath(await getLocale(), accountStateRedirect(result.state) ?? fallback));
}
