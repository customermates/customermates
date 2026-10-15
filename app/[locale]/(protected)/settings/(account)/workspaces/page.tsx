import { WorkspacesPageView } from "../components/workspaces-page-view";

import { getListMyWorkspacesInteractor } from "@/core/di";
import { requireAccess } from "@/features/auth/next/require";
import { PageContainer } from "@/components/shared/page-container";
import { unwrapPage } from "@/core/validation/next/unwrap-page";

export default async function WorkspacesSettingsPage() {
  await requireAccess();

  const workspaces = await unwrapPage(getListMyWorkspacesInteractor().invoke());

  return (
    <PageContainer>
      <WorkspacesPageView workspaces={workspaces} />
    </PageContainer>
  );
}
