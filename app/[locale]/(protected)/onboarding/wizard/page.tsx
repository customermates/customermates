import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import { OnboardingWizard } from "./components/onboarding-wizard";

import { getGetCompanySettingsInteractor, getInviteTokenValidationInteractor, getUserService } from "@/core/di";
import { requireSession } from "@/features/auth/next/require";
import { CenteredCardPage } from "@/components/shared/centered-card-page";

export default async function OnboardingWizardPage() {
  const session = await requireSession();
  const user = await getUserService().getUser();

  if (user) {
    if (user.onboardingWizardCompletedAt) redirect("/");
    if (!user.role?.isSystemRole) redirect("/");
  }

  let isInvited = Boolean(session.user.companyId);
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

  const settingsResult = user ? await getGetCompanySettingsInteractor().invoke() : null;
  const initialTerminology = settingsResult?.ok ? settingsResult.data.terminology.presets : [];

  const sessionName = session.user?.name ?? "";
  const isEmail = sessionName.includes("@");
  const spaceIndex = sessionName.indexOf(" ");
  const sessionFirstName = isEmail
    ? undefined
    : spaceIndex === -1
      ? sessionName || undefined
      : sessionName.slice(0, spaceIndex);
  const sessionLastName = isEmail ? undefined : spaceIndex === -1 ? undefined : sessionName.slice(spaceIndex + 1);
  const sessionAvatarUrl = session.user?.image?.startsWith("https:") ? session.user.image : "";

  return (
    <CenteredCardPage>
      <OnboardingWizard
        initialTerminology={initialTerminology}
        isInvited={isInvited}
        profileCompleted={Boolean(user)}
        sessionAvatarUrl={sessionAvatarUrl}
        sessionEmail={session.user?.email ?? ""}
        sessionFirstName={sessionFirstName}
        sessionLastName={sessionLastName}
      />
    </CenteredCardPage>
  );
}
