import { ProfileSettingsForm } from "../components/profile-settings-form";

import { NotificationPreferencesCard } from "../components/notification-preferences-card";

import { getGetNotificationPreferencesInteractor, getGetUserDetailsInteractor } from "@/core/di";
import { requireAccess } from "@/features/auth/next/require";
import { resolveRequestAccountState } from "@/features/auth/next/resolve-account-state";
import { PageContainer } from "@/components/shared/page-container";
import { unwrapPage } from "@/core/validation/next/unwrap-page";

export default async function ProfileSettingsPage() {
  await requireAccess();

  const [userDetails, account, notificationPreferences] = await Promise.all([
    unwrapPage(getGetUserDetailsInteractor().invoke()),
    resolveRequestAccountState(),
    unwrapPage(getGetNotificationPreferencesInteractor().invoke()),
  ]);

  const emailVerified = account.emailVerified ?? false;

  return (
    <PageContainer>
      <ProfileSettingsForm emailVerified={emailVerified} userDetails={userDetails} />

      <NotificationPreferencesCard initial={notificationPreferences} />
    </PageContainer>
  );
}
