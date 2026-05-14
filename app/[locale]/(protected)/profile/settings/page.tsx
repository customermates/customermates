import { UserSettingsForm } from "../components/user-settings-form";

import { requireAccess } from "@/features/auth/next/require";
import { PageContainer } from "@/components/shared/page-container";

export default async function ProfileSettingsPage() {
  await requireAccess();

  return (
    <PageContainer>
      <UserSettingsForm />
    </PageContainer>
  );
}
