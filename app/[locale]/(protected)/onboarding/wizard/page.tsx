import { Status } from "@/generated/prisma";
import { redirect } from "next/navigation";
import { appRedirectHref } from "@/features/auth/next/app-redirect";
import { workspaceLocalePath } from "@/core/navigation/workspace-paths";
import { buildLocalePath } from "@/i18n/locale-registry";
import { getLocale } from "next-intl/server";

import { OnboardingWizard } from "./components/onboarding-wizard";
import { buildWizardFlowContext, wizardOwnerFlow } from "./components/onboarding-wizard-flow";

import { requireAccountState } from "@/features/auth/next/require";
import { CenteredCardPage } from "@/components/shared/centered-card-page";
import { ONBOARDING_INTENT_QUERY_PARAM, onboardingIntentAuthRedirects } from "@/features/company/onboarding-intent-url";
import { resolveOnboardingIntent } from "@/features/company/next/onboarding-intent";
import {
  getGetOnboardingJobChoiceInteractor,
  getGetOnboardingWizardProgressInteractor,
  getGetWorkspaceSetupStatusInteractor,
  getListMyWorkspacesInteractor,
} from "@/core/di";
import { SETUP_WORKSPACE_QUERY_PARAM } from "@/ee/workspace-setup/workspace-setup-link";
import { runWithTenant } from "@/core/decorators/tenant-context";
import { isRedirect } from "@/features/auth/auth-outcome";
import type { WorkspaceSetupStatusView } from "@/ee/workspace-setup/workspace-setup-status";
import type { OnboardingJobChoiceView } from "@/features/onboarding-funnel/get-onboarding-job-choice.interactor";

import { env } from "@/env";
import { ConfirmEmailCard } from "./components/confirm-email-card";

function emailConfirmationRequired(emailVerified: boolean | null): boolean {
  if (emailVerified !== false) return false;
  return env.APP_MODE === "cloud" || (env.APP_MODE === "self-hosted" && Boolean(env.RESEND_API_KEY));
}

type Props = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export default async function OnboardingWizardPage({ searchParams }: Props) {
  const params = await searchParams;
  const linkedWorkspace = params[SETUP_WORKSPACE_QUERY_PARAM];
  if (typeof linkedWorkspace === "string") {
    const workspaces = await getListMyWorkspacesInteractor().invoke();
    const linked = workspaces.data.find(
      (workspace) => workspace.companyId === linkedWorkspace && workspace.status === Status.active,
    );
    const locale = await getLocale();
    if (!linked) redirect(buildLocalePath(locale, "/dashboard"));
    redirect(workspaceLocalePath(locale, linked.slug, "/onboarding/wizard"));
  }
  const onboardingIntent = await resolveOnboardingIntent(params[ONBOARDING_INTENT_QUERY_PARAM]);
  if (onboardingIntent.status === "invalid" && onboardingIntent.source === "explicit")
    redirect(await appRedirectHref(`/auth/error?type=${onboardingIntent.errorMessage}`));

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
    redirect(await appRedirectHref("/auth/error?type=invalidOnboardingIntent"));

  const invitation = effectiveIntent?.type === "invitation" ? effectiveIntent : null;
  const hasExplicitCreateIntent = effectiveIntent?.type === "createCompany";
  const isInvited = user
    ? user.role?.isSystemRole === false
    : Boolean(invitation || (!hasExplicitCreateIntent && sessionUser.companyId));
  const canCreateCompany = Boolean(
    effectiveIntent?.type === "createCompany" && effectiveIntent.authUserId === sessionUser.id,
  );
  if (!user && !isInvited && !canCreateCompany) redirect(await appRedirectHref("/onboarding"));

  if (!user && !isInvited && emailConfirmationRequired(resolution.emailVerified)) {
    return (
      <CenteredCardPage align="top">
        <ConfirmEmailCard email={sessionUser.email} onboardingIntent={effectiveIntent?.intent} />
      </CenteredCardPage>
    );
  }

  const ownerFlow = wizardOwnerFlow(env.APP_MODE, isInvited);
  let setupStatus: WorkspaceSetupStatusView | undefined;
  let setupStepCompleted = false;
  if (user?.role?.isSystemRole) {
    const status = await runWithTenant(user, () => getGetWorkspaceSetupStatusInteractor().invoke());
    if (status.ok) setupStatus = status.data;
    setupStepCompleted = user.onboardingWikiStepCompletedAt !== null || (!setupStatus?.available && !ownerFlow);
  }
  let jobChoice: OnboardingJobChoiceView | undefined;
  if (user?.role?.isSystemRole && ownerFlow)
    jobChoice = (await runWithTenant(user, () => getGetOnboardingJobChoiceInteractor().invoke())).data;

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
  const savedProgress = user?.role?.isSystemRole ? await getGetOnboardingWizardProgressInteractor().invoke() : null;
  if (savedProgress && isRedirect(savedProgress)) redirect(await appRedirectHref(savedProgress.redirect));
  const flow = buildWizardFlowContext({
    appMode: env.APP_MODE,
    isInvited,
    profileCompleted: Boolean(user),
    setupOffered: Boolean(setupStatus?.available),
    teamSize: jobChoice?.teamSize,
  });

  return (
    <CenteredCardPage align="top">
      <OnboardingWizard
        canNameWorkspace={canCreateCompany}
        flow={flow}
        inviterName={invitation?.inviterName}
        isInvited={isInvited}
        jobChoice={jobChoice}
        onboardingIntent={effectiveIntent?.intent}
        profileCompleted={Boolean(user)}
        savedProgress={savedProgress?.data}
        sessionAvatarUrl={sessionAvatarUrl}
        sessionEmail={sessionUser.email}
        sessionFirstName={sessionFirstName}
        sessionLastName={sessionLastName}
        setupStatus={setupStatus}
        setupStepCompleted={setupStepCompleted}
        userId={user?.role?.isSystemRole ? user.id : undefined}
        workspaceName={invitation?.companyName}
      />
    </CenteredCardPage>
  );
}
