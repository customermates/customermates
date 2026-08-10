import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import { OnboardingWizard } from "./components/onboarding-wizard";

import { getInviteTokenValidationInteractor } from "@/core/di";
import { requireAccountState } from "@/features/auth/next/require";
import { CenteredCardPage } from "@/components/shared/centered-card-page";

export default async function OnboardingWizardPage() {
  const resolution = await requireAccountState(["unregistered", "onboarding"]);
  const { sessionUser, user } = resolution;
  if (!sessionUser) redirect("/auth/signin");

  if (user) {
    if (user.onboardingWizardCompletedAt) redirect("/");
    if (!user.role?.isSystemRole) redirect("/");
  }

  let isInvited = Boolean(sessionUser.companyId);
  if (!user && !isInvited) {
    const cookieStore = await cookies();
    const inviteTokenValue = cookieStore.get("inviteToken")?.value;
    if (inviteTokenValue) {
      const validation = await getInviteTokenValidationInteractor().invoke({
        token: inviteTokenValue,
      });
      isInvited = validation.ok && validation.data.valid;
    }
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
        isInvited={isInvited}
        profileCompleted={Boolean(user)}
        sessionAvatarUrl={sessionAvatarUrl}
        sessionEmail={sessionUser.email}
        sessionFirstName={sessionFirstName}
        sessionLastName={sessionLastName}
      />
    </CenteredCardPage>
  );
}
