import { ProfileSettingsForm } from "../components/profile-settings-form";

import { getGetUserDetailsInteractor } from "@/core/di";
import { requireAccess } from "@/features/auth/next/require";
import { resolveRequestAccountState } from "@/features/auth/next/resolve-account-state";
import { PageContainer } from "@/components/shared/page-container";

export default async function ProfileSettingsPage() {
  await requireAccess();

  const [result, account] = await Promise.all([getGetUserDetailsInteractor().invoke(), resolveRequestAccountState()]);

  const emailVerified = account.emailVerified ?? false;

  return (
    <PageContainer>
      <ProfileSettingsForm emailVerified={emailVerified} userDetails={result.data} />
    </PageContainer>
  );
}
