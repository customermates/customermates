import { redirect } from "next/navigation";
import { Resource } from "@/generated/prisma";

import { AuditLogsCard } from "../components/audit-log/audit-logs-card";

import { getGetAuditLogsInteractor } from "@/core/app-di";
import { requireAccess } from "@/features/auth/next/require";
import { PageContainer } from "@/components/shared/page-container";
import { env } from "@/env";

export default async function CompanyAuditLogsPage() {
  if (!env.CLOUD_HOSTED) redirect("/dashboard");

  await requireAccess({ resource: Resource.auditLog });

  const auditLogs = await getGetAuditLogsInteractor().invoke({ p13nId: "audit-logs-card-store" });

  return (
    <PageContainer padded={false}>
      <AuditLogsCard initialAuditLogs={auditLogs.ok ? auditLogs.data : { items: [] }} />
    </PageContainer>
  );
}
