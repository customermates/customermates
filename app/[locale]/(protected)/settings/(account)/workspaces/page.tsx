import { WorkspacesPageView } from "../components/workspaces-page-view";

import { getGetWorkspaceLeaveInteractor, getListMyWorkspacesInteractor } from "@/core/di";
import { requireAccess } from "@/features/auth/next/require";
import { PageContainer } from "@/components/shared/page-container";
import { unwrapPage } from "@/core/validation/next/unwrap-page";

export default async function WorkspacesSettingsPage() {
  await requireAccess();

  const [workspaces, leave] = await Promise.all([
    unwrapPage(getListMyWorkspacesInteractor().invoke()),
    unwrapPage(getGetWorkspaceLeaveInteractor().invoke()),
  ]);

  return (
    <PageContainer>
      <WorkspacesPageView leaveRefusal={leave.refusal} workspaces={workspaces} />
    </PageContainer>
  );
}
