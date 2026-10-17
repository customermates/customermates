import { notFound } from "next/navigation";

import { WorkspaceGeneralView } from "../components/general/workspace-general-view";

import { getGetWorkspaceLeaveInteractor, getListMyWorkspacesInteractor } from "@/core/di";
import { requireAccess } from "@/features/auth/next/require";
import { PageContainer } from "@/components/shared/page-container";
import { unwrapPage } from "@/core/validation/next/unwrap-page";

export default async function WorkspaceGeneralPage() {
  await requireAccess();

  const [workspaces, leave] = await Promise.all([
    unwrapPage(getListMyWorkspacesInteractor().invoke()),
    unwrapPage(getGetWorkspaceLeaveInteractor().invoke()),
  ]);
  const workspace = workspaces.find((candidate) => candidate.isCurrent);
  if (!workspace) notFound();

  return (
    <PageContainer>
      <WorkspaceGeneralView leaveRefusal={leave.refusal} workspace={workspace} />
    </PageContainer>
  );
}
