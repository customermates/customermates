import { redirect } from "next/navigation";
import { getLocale } from "next-intl/server";

import { OnboardingWizard } from "./components/onboarding-wizard";

import { requireAccountState } from "@/features/auth/next/require";
import { CenteredCardPage } from "@/components/shared/centered-card-page";
import { ONBOARDING_INTENT_QUERY_PARAM, onboardingIntentAuthRedirects } from "@/features/company/onboarding-intent-url";
import { resolveOnboardingIntent } from "@/features/company/next/onboarding-intent";
import { buildLocalePath } from "@/i18n/locale-registry";
import { getEntitlementService, getGetWikiPagesInteractor } from "@/core/di";
import { runWithTenant } from "@/core/decorators/tenant-context";
import { env } from "@/env";

type Props = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export default async function OnboardingWizardPage({ searchParams }: Props) {
  const params = await searchParams;
  const onboardingIntent = await resolveOnboardingIntent(params[ONBOARDING_INTENT_QUERY_PARAM]);
  if (onboardingIntent.status === "invalid" && onboardingIntent.source === "explicit")
    redirect(buildLocalePath(await getLocale(), `/auth/error?type=${onboardingIntent.errorMessage}`));
  const activeIntent = onboardingIntent.status === "valid" ? onboardingIntent : null;
  const resolution = await requireAccountState(
    ["unregistered", "onboarding"],
    "/",
    activeIntent ? onboardingIntentAuthRedirects(activeIntent.intent) : undefined,
  );
  const { sessionUser, user } = resolution;
  if (!sessionUser) redirect("/auth/signin");

  const effectiveIntent = user ? null : activeIntent;
  if (effectiveIntent?.type === "createCompany" && effectiveIntent.authUserId !== sessionUser.id)
    redirect(buildLocalePath(await getLocale(), "/auth/error?type=invalidOnboardingIntent"));

  const invitation = effectiveIntent?.type === "invitation" ? effectiveIntent : null;
  const hasExplicitCreateIntent = effectiveIntent?.type === "createCompany";
  const isInvited = user
    ? user.role?.isSystemRole === false
    : Boolean(invitation || (!hasExplicitCreateIntent && sessionUser.companyId));
  const canCreateCompany = Boolean(
    effectiveIntent?.type === "createCompany" && effectiveIntent.authUserId === sessionUser.id,
  );
  if (!user && !isInvited && !canCreateCompany) redirect(buildLocalePath(await getLocale(), "/onboarding"));

  let wikiCompleted = false;
  let canSetupWithMate = false;
  if (user?.role?.isSystemRole) {
    const [wikiPages, agentDenial] = await runWithTenant(user, () =>
      Promise.all([
        getGetWikiPagesInteractor().invoke({ page: 1, pageSize: 5 }),
        getEntitlementService().require("agentChat"),
      ]),
    );
    wikiCompleted = wikiPages.ok && wikiPages.data.total > 0;
    canSetupWithMate = env.APP_MODE !== "demo" && agentDenial === null;
  }

  const sessionName = sessionUser.name ?? "";
  const isEmail = sessionName.includes("@");
  const spaceIndex = sessionName.indexOf(" ");
  const sessionFirstName = isEmail
    ? undefined
    : spaceIndex === -1
      ? sessionName || undefined
      : sessionName.slice(0, spaceIndex);
  const sessionLastName = isEmail ? undefined : spaceIndex === -1 ? undefined : sessionName.slice(spaceIndex + 1);
  const sessionAvatarUrl = sessionUser.image?.startsWith("https:") ? sessionUser.image : "";

  return (
    <CenteredCardPage className="animate-page-result-in motion-reduce:animate-none">
      <OnboardingWizard
        canSetupWithMate={canSetupWithMate}
        inviterName={invitation?.inviterName}
        isInvited={isInvited}
        onboardingIntent={effectiveIntent?.intent}
        profileCompleted={Boolean(user)}
        sessionAvatarUrl={sessionAvatarUrl}
        sessionEmail={sessionUser.email}
        sessionFirstName={sessionFirstName}
        sessionLastName={sessionLastName}
        wikiCompleted={wikiCompleted}
      />
    </CenteredCardPage>
  );
}
