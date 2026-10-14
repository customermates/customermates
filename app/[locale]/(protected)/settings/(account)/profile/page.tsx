import { ProfileSettingsForm } from "../components/profile-settings-form";

import { getGetUserDetailsInteractor } from "@/core/di";
import { requireAccess } from "@/features/auth/next/require";
import { resolveRequestAccountState } from "@/features/auth/next/resolve-account-state";
import { PageContainer } from "@/components/shared/page-container";
import { unwrapPage } from "@/core/validation/next/unwrap-page";

export default async function ProfileSettingsPage() {
  await requireAccess();

  const [userDetails, account] = await Promise.all([
    unwrapPage(getGetUserDetailsInteractor().invoke()),
    resolveRequestAccountState(),
  ]);

  const emailVerified = account.emailVerified ?? false;

  return (
    <PageContainer>
      <ProfileSettingsForm emailVerified={emailVerified} userDetails={userDetails} />
    </PageContainer>
  );
}
