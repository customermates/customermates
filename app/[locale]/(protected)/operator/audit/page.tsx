import { notFound } from "next/navigation";

import { OperatorAuditPageView } from "../components/audit/operator-audit-page-view";

import { getGetOperatorAuditLogsInteractor } from "@/core/di";
import { appErrorDetails } from "@/core/errors/app-errors";
import { decodeGetParams } from "@/core/utils/get-params";
import { PageContainer } from "@/components/shared/page-container";
import { unwrapValidated } from "@/core/validation/validation.utils";

type Props = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export default async function OperatorAuditPage({ searchParams }: Props) {
  const params = await searchParams;
  const auditParams = decodeGetParams(params);

  try {
    const audit = await unwrapValidated(getGetOperatorAuditLogsInteractor().invoke(auditParams));

    return (
      <PageContainer padded={false}>
        <OperatorAuditPageView initialAudit={audit} />
      </PageContainer>
    );
  } catch (error) {
    if (appErrorDetails(error)) notFound();
    throw error;
  }
}
