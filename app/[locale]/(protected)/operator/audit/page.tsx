import type { Metadata } from "next";

import { getTranslations } from "next-intl/server";
import { notFound } from "next/navigation";

import { OperatorAuditPageView } from "./operator-audit-page-view";

import { PageContainer } from "@/components/shared/page-container";
import { getOperatorAuditListInteractor, getOperatorConsoleVisibilityInteractor } from "@/core/di";
import { appErrorDetails } from "@/core/errors/app-errors";
import { decodeGetParams } from "@/core/utils/get-params";
import { unwrapValidated } from "@/core/validation/validation.utils";

type Props = { searchParams: Promise<Record<string, string | string[] | undefined>> };

export async function generateMetadata(): Promise<Metadata> {
  const robots = { follow: false, index: false, noarchive: true, nosnippet: true };
  if (!(await getOperatorConsoleVisibilityInteractor().invoke())) return { robots };

  const t = await getTranslations("OperatorAudit");

  return { title: t("title"), description: t("description"), robots };
}

export default async function OperatorAuditPage({ searchParams }: Props) {
  const params = decodeGetParams(await searchParams);

  try {
    const events = await unwrapValidated(getOperatorAuditListInteractor().invoke(params));

    return (
      <PageContainer padded={false}>
        <OperatorAuditPageView initialEvents={events} />
      </PageContainer>
    );
  } catch (error) {
    if (appErrorDetails(error)) notFound();
    throw error;
  }
}
