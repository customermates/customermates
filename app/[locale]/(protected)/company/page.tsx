import { Action, TaskType } from "@/generated/prisma";
import { Resource } from "@/generated/prisma";

import { CompanyDetailsCard } from "./components/company-details/company-details-card";
import { SubscriptionCard } from "./components/subscription/subscription-card";
import { CompanyManagementTabs } from "./components/company-management-tabs";

import {
  getGetUsersInteractor,
  getUserService,
  getGetTaskByTypeInteractor,
  getGetCompanyDetailsInteractor,
  getGetRolesInteractor,
  getGetSubscriptionInteractor,
  getGetWebhookDeliveriesInteractor,
  getGetWebhooksInteractor,
  getRouteGuardService,
  getGetAuditLogsInteractor,
} from "@/core/di";
import { XPageRowContent } from "@/components/x-layout-primitives/x-page-row-content";
import { XPageRow } from "@/components/x-layout-primitives/x-page-row";
import { decodeGetParams } from "@/core/utils/get-params";
import { XPageContainer } from "@/components/x-layout-primitives/x-page-container";
import { IS_CLOUD_HOSTED } from "@/constants/env";
type Props = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export default async function CompanyPage({ searchParams }: Props) {
  await getRouteGuardService().ensureAccessOrRedirect({ resource: Resource.company });

  const params = await searchParams;
  const userParams = decodeGetParams(params);

  const userSvc = getUserService();
  const [canAccessAuditLogsPermission, canAccessApiReadAll, canAccessApiReadOwn] = await Promise.all([
    userSvc.hasPermission(Resource.auditLog, Action.readAll),
    userSvc.hasPermission(Resource.api, Action.readAll),
    userSvc.hasPermission(Resource.api, Action.readOwn),
  ]);
  const canAccessAuditLogs = IS_CLOUD_HOSTED && canAccessAuditLogsPermission;
  const canAccessApi = canAccessApiReadAll || canAccessApiReadOwn;

  const [companyResult, users, roles, taskResult, auditLogs, webhooks, webhookDeliveries, subscriptionResult] =
    await Promise.all([
      getGetCompanyDetailsInteractor().invoke(),
      getGetUsersInteractor().invoke({ ...userParams, p13nId: "users-card-store" }),
      getGetRolesInteractor().invoke({ p13nId: "roles-card-store" }),
      getGetTaskByTypeInteractor().invoke({ type: TaskType.companyOnboarding }),
      canAccessAuditLogs
        ? getGetAuditLogsInteractor().invoke({ p13nId: "audit-logs-card-store" })
        : Promise.resolve({ ok: true, data: { items: [] } }),
      canAccessApi
        ? getGetWebhooksInteractor().invoke({ ...userParams, p13nId: "webhooks-card-store" })
        : Promise.resolve({ ok: true, data: { items: [] } }),
      canAccessApi
        ? getGetWebhookDeliveriesInteractor().invoke({ p13nId: "webhook-deliveries-card-store" })
        : Promise.resolve({ ok: true, data: { items: [] } }),
      getGetSubscriptionInteractor().invoke(),
    ]);

  const company = companyResult.data;
  const task = taskResult.data;
  const subscription = subscriptionResult.data;
  const isCompanyOnboarding = Boolean(task);

  return (
    <XPageContainer>
      <XPageRow columns="2/1">
        <XPageRowContent>
          <CompanyManagementTabs
            auditLogs={auditLogs.ok ? auditLogs.data : { items: [] }}
            canAccessApi={canAccessApi}
            canAccessAuditLogs={canAccessAuditLogs}
            deliveries={webhookDeliveries.ok ? webhookDeliveries.data : { items: [] }}
            isCompanyOnboarding={isCompanyOnboarding}
            roles={roles.ok ? roles.data : { items: [] }}
            users={users.ok ? users.data : { items: [] }}
            webhooks={webhooks.ok ? webhooks.data : { items: [] }}
          />
        </XPageRowContent>

        <XPageRowContent>
          {IS_CLOUD_HOSTED && <SubscriptionCard initialSubscription={subscription} />}

          <CompanyDetailsCard company={company} isCompanyOnboarding={isCompanyOnboarding} />
        </XPageRowContent>
      </XPageRow>
    </XPageContainer>
  );
}
