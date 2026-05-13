import { UserSettingsForm } from "../components/user-settings-form";

import { getRouteGuardService } from "@/core/app-di";
import { PageContainer } from "@/components/shared/page-container";

export default async function ProfileSettingsPage() {
  await getRouteGuardService().ensureAccessOrRedirect();

  return (
    <PageContainer>
      <UserSettingsForm />
    </PageContainer>
  );
}
