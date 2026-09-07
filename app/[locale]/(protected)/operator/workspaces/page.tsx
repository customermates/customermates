import { notFound } from "next/navigation";

import { OperatorWorkspacesPageView } from "../components/workspaces/operator-workspaces-page-view";

import { getGetOperatorWorkspacesInteractor } from "@/core/di";
import { appErrorDetails } from "@/core/errors/app-errors";
import { readSurfaceParams } from "@/core/data-view/next/read-surface-params";
import { SURFACE } from "@/core/data-view/data-view-keys";
import { PageContainer } from "@/components/shared/page-container";
import { unwrapValidated } from "@/core/validation/validation.utils";

type Props = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export default async function OperatorWorkspacesPage({ searchParams }: Props) {
  const workspaceParams = await readSurfaceParams(SURFACE.operatorWorkspaces, searchParams);

  try {
    const workspaces = await unwrapValidated(getGetOperatorWorkspacesInteractor().invoke(workspaceParams));

    return (
      <PageContainer padded={false}>
        <OperatorWorkspacesPageView initialWorkspaces={workspaces} />
      </PageContainer>
    );
  } catch (error) {
    if (appErrorDetails(error)) notFound();
    throw error;
  }
}
