import type { Metadata } from "next";

import { getTranslations } from "next-intl/server";
import { notFound } from "next/navigation";

import { OperatorUsersPageView } from "./operator-users-page-view";

import { PageContainer } from "@/components/shared/page-container";
import { getOperatorConsoleVisibilityInteractor, getOperatorUsersListInteractor } from "@/core/di";
import { appErrorDetails } from "@/core/errors/app-errors";
import { decodeGetParams } from "@/core/utils/get-params";
import { unwrapValidated } from "@/core/validation/validation.utils";

type Props = { searchParams: Promise<Record<string, string | string[] | undefined>> };

export async function generateMetadata(): Promise<Metadata> {
  const robots = { follow: false, index: false, noarchive: true, nosnippet: true };
  if (!(await getOperatorConsoleVisibilityInteractor().invoke())) return { robots };

  const t = await getTranslations("OperatorUsers");

  return { title: t("title"), description: t("description"), robots };
}

export default async function OperatorUsersPage({ searchParams }: Props) {
  const params = decodeGetParams(await searchParams);

  try {
    const users = await unwrapValidated(getOperatorUsersListInteractor().invoke(params));

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
