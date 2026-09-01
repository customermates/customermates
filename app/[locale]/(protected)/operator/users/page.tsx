import { notFound } from "next/navigation";

import { OperatorUsersPageView } from "../components/users/operator-users-page-view";

import { getGetOperatorUsersInteractor } from "@/core/di";
import { appErrorDetails } from "@/core/errors/app-errors";
import { decodeGetParams } from "@/core/utils/get-params";
import { PageContainer } from "@/components/shared/page-container";
import { unwrapValidated } from "@/core/validation/validation.utils";

type Props = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export default async function OperatorUsersPage({ searchParams }: Props) {
  const params = await searchParams;
  const userParams = decodeGetParams(params);

  try {
    const users = await unwrapValidated(getGetOperatorUsersInteractor().invoke(userParams));

    return (
      <PageContainer padded={false}>
        <OperatorUsersPageView initialUsers={users} />
      </PageContainer>
    );
  } catch (error) {
    if (appErrorDetails(error)) notFound();
    throw error;
  }
}
