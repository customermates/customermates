import { redirect } from "next/navigation";
import { getLocale } from "next-intl/server";

import { ErrorPageContent } from "./error-page-content";

import { isCanonicalInactiveErrorType, isRestrictedAccountState } from "@/features/auth/account-state";
import { requireAccountState } from "@/features/auth/next/require";
import { resolveRequestAccountState } from "@/features/auth/next/resolve-account-state";
import { buildLocalePath } from "@/i18n/locale-registry";

import type { ErrorPageKey } from "./error-page-content";
import { NOINDEX_METADATA } from "@/core/seo/noindex-metadata";

export const metadata = NOINDEX_METADATA;

const ERROR_KEYS = new Set<ErrorPageKey>([
  "invalidInviteLink",
  "invalidOnboardingIntent",
  "inviteLinkExpired",
  "onboardingSessionExpired",
]);

type Props = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export default async function ErrorPage({ searchParams }: Props) {
  const params = await searchParams;
  const requestedErrorKey = typeof params.type === "string" ? params.type : null;
  const resolution = await resolveRequestAccountState();
  const isInactive = resolution.state === "inactive";
  const isOnboardingError = Boolean(requestedErrorKey && ERROR_KEYS.has(requestedErrorKey as ErrorPageKey));

  if (isInactive && !isCanonicalInactiveErrorType(params.type))
    redirect(buildLocalePath(await getLocale(), "/auth/error?type=inactiveUser"));

  if (
    !isInactive &&
    !isOnboardingError &&
    (requestedErrorKey === "inactiveUser" || isRestrictedAccountState(resolution.state))
  )
    await requireAccountState("inactive");

  const errorKey = isInactive ? "inactiveUser" : isOnboardingError ? (requestedErrorKey as ErrorPageKey) : null;

  return <ErrorPageContent errorKey={errorKey} isInactive={isInactive} />;
}
