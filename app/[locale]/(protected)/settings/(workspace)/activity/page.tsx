import { Resource } from "@/generated/prisma";

import { AuditLogsPageView } from "../components/audit-log/audit-logs-page-view";

import { getGetAuditLogsInteractor } from "@/core/di";
import { requireAccess } from "@/features/auth/next/require";
import { readSurfaceParams } from "@/core/data-view/next/read-surface-params";
import { SURFACE } from "@/core/data-view/data-view-keys";
import { PageContainer } from "@/components/shared/page-container";
import { unwrapValidated } from "@/core/validation/validation.utils";

type Props = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export default async function CompanyAuditLogsPage({ searchParams }: Props) {
  await requireAccess({ resource: Resource.auditLog });

  const auditLogParams = await readSurfaceParams(SURFACE.auditLogs, searchParams);

  const auditLogs = await unwrapValidated(getGetAuditLogsInteractor().invoke(auditLogParams));

  return (
    <PageContainer padded={false}>
      <AuditLogsPageView initialAuditLogs={auditLogs} />
    </PageContainer>
  );
}
