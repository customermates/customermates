import { WorkspacesPageView } from "../components/workspaces-page-view";

import { getListMyWorkspacesInteractor, getListWorkspaceLeavesInteractor } from "@/core/di";
import { requireAccess } from "@/features/auth/next/require";
import { PageContainer } from "@/components/shared/page-container";
import { unwrapPage } from "@/core/validation/next/unwrap-page";

export default async function WorkspacesSettingsPage() {
  await requireAccess();

  const [workspaces, leaves] = await Promise.all([
    unwrapPage(getListMyWorkspacesInteractor().invoke()),
    unwrapPage(getListWorkspaceLeavesInteractor().invoke()),
  ]);

  return (
    <PageContainer>
      <WorkspacesPageView leaves={leaves} workspaces={workspaces} />
    </PageContainer>
  );
}
