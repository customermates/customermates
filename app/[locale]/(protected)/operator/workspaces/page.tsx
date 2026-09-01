import { notFound } from "next/navigation";

import { OperatorWorkspacesPageView } from "../components/workspaces/operator-workspaces-page-view";

import { getGetOperatorWorkspacesInteractor } from "@/core/di";
import { appErrorDetails } from "@/core/errors/app-errors";
import { decodeGetParams } from "@/core/utils/get-params";
import { PageContainer } from "@/components/shared/page-container";
import { unwrapValidated } from "@/core/validation/validation.utils";

type Props = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export default async function OperatorWorkspacesPage({ searchParams }: Props) {
  const params = await searchParams;
  const workspaceParams = decodeGetParams(params);

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
