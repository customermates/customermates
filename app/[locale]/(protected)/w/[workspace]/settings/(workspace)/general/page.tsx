import { notFound } from "next/navigation";

import { WorkspaceGeneralView } from "../components/general/workspace-general-view";

import {
  getGetPublicLinkSettingsInteractor,
  getGetWorkspaceDeletionInteractor,
  getGetWorkspaceLeaveInteractor,
  getListMyWorkspacesInteractor,
} from "@/core/di";
import { requireAccess } from "@/features/auth/next/require";
import { PageContainer } from "@/components/shared/page-container";
import { unwrapPage } from "@/core/validation/next/unwrap-page";

export default async function WorkspaceGeneralPage() {
  await requireAccess();

  const [workspaces, leave, deletion, publicLinks] = await Promise.all([
    unwrapPage(getListMyWorkspacesInteractor().invoke()),
    unwrapPage(getGetWorkspaceLeaveInteractor().invoke()),
    unwrapPage(getGetWorkspaceDeletionInteractor().invoke()),
    unwrapPage(getGetPublicLinkSettingsInteractor().invoke()),
  ]);
  const workspace = workspaces.find((candidate) => candidate.isCurrent);
  if (!workspace) notFound();

  return (
    <PageContainer>
      <WorkspaceGeneralView
        deleteRefusal={deletion.refusal}
        leaveRefusal={leave.refusal}
        publicLinks={publicLinks}
        workspace={workspace}
      />
    </PageContainer>
  );
}
