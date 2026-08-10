import { Resource } from "@/generated/prisma";

import { AuditLogsCard } from "../components/audit-log/audit-logs-card";

import { getGetAuditLogsInteractor } from "@/core/di";
import { requireAccess } from "@/features/auth/next/require";
import { decodeGetParams } from "@/core/utils/get-params";
import { PageContainer } from "@/components/shared/page-container";
import { unwrapValidated } from "@/core/validation/validation.utils";

type Props = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export default async function CompanyAuditLogsPage({ searchParams }: Props) {
  await requireAccess({ resource: Resource.auditLog });

  const params = await searchParams;
  const auditLogParams = decodeGetParams(params);

  const auditLogs = await unwrapValidated(
    getGetAuditLogsInteractor().invoke({
      ...auditLogParams,
      p13nId: "audit-logs-card-store",
    }),
  );

  return (
    <PageContainer padded={false}>
      <AuditLogsCard initialAuditLogs={auditLogs} />
    </PageContainer>
  );
}
