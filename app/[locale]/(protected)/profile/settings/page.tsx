import { ProfileSettingsForm } from "../components/profile-settings-form";

import { getAuthService, getGetUserDetailsInteractor } from "@/core/di";
import { requireAccess } from "@/features/auth/next/require";
import { PageContainer } from "@/components/shared/page-container";

export default async function ProfileSettingsPage() {
  await requireAccess();

  const [result, session] = await Promise.all([getGetUserDetailsInteractor().invoke(), getAuthService().getSession()]);

  const emailVerified = session?.user?.emailVerified ?? false;

  return (
    <PageContainer>
      <ProfileSettingsForm emailVerified={emailVerified} userDetails={result.data} />
    </PageContainer>
  );
}
