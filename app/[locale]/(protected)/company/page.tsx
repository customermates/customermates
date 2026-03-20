import { Action, TaskType } from "@/generated/prisma";
import { Resource } from "@/generated/prisma";

import { CompanyDetailsCard } from "./components/company-details/company-details-card";
import { SubscriptionCard } from "./components/subscription/subscription-card";
import { CompanyManagementTabs } from "./components/company-management-tabs";

import { GetUsersInteractor } from "@/features/user/get/get-users.interactor";
import { GetTaskByTypeInteractor } from "@/features/tasks/get/get-task-by-type.interactor";
import { GetCompanyDetailsInteractor } from "@/features/company/get-company-details.interactor";
import { GetRolesInteractor } from "@/features/role/get-roles.interactor";
import { GetSubscriptionInteractor } from "@/ee/subscription/get-subscription.interactor";
import { GetWebhookDeliveriesInteractor } from "@/features/webhook/get-webhook-deliveries.interactor";
import { GetWebhooksInteractor } from "@/features/webhook/get-webhooks.interactor";
import { XPageRowContent } from "@/components/x-layout-primitives/x-page-row-content";
import { XPageRow } from "@/components/x-layout-primitives/x-page-row";
import { di } from "@/core/dependency-injection/container";
import { decodeGetParams } from "@/core/utils/get-params";
import { RouteGuardService } from "@/features/auth/route-guard.service";
import { XPageContainer } from "@/components/x-layout-primitives/x-page-container";
import { GetAuditLogsInteractor } from "@/ee/audit-log/get/get-audit-logs.interactor";
import { UserService } from "@/features/user/user.service";
import { IS_CLOUD_HOSTED } from "@/constants/env";
type Props = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export default async function CompanyPage({ searchParams }: Props) {
  await di.get(RouteGuardService).ensureAccessOrRedirect({ resource: Resource.company });

  const params = await searchParams;
  const userParams = decodeGetParams(params);

  const userService = di.get(UserService);
  const [canAccessAuditLogsPermission, canAccessApiReadAll, canAccessApiReadOwn] = await Promise.all([
    userService.hasPermission(Resource.auditLog, Action.readAll),
    userService.hasPermission(Resource.api, Action.readAll),
    userService.hasPermission(Resource.api, Action.readOwn),
  ]);
  const canAccessAuditLogs = IS_CLOUD_HOSTED && canAccessAuditLogsPermission;
  const canAccessApi = canAccessApiReadAll || canAccessApiReadOwn;

  const [company, users, roles, task, auditLogs, webhooks, webhookDeliveries, subscription] = await Promise.all([
    di.get(GetCompanyDetailsInteractor).invoke(),
    di.get(GetUsersInteractor).invoke({ ...userParams, p13nId: "users-card-store" }),
    di.get(GetRolesInteractor).invoke({ p13nId: "roles-card-store" }),
    di.get(GetTaskByTypeInteractor).invoke({ type: TaskType.companyOnboarding }),
    canAccessAuditLogs
      ? di.get(GetAuditLogsInteractor).invoke({ p13nId: "audit-logs-card-store" })
      : Promise.resolve({ ok: true, data: { items: [] } }),
    canAccessApi
      ? di.get(GetWebhooksInteractor).invoke({ ...userParams, p13nId: "webhooks-card-store" })
      : Promise.resolve({ ok: true, data: { items: [] } }),
    canAccessApi
      ? di.get(GetWebhookDeliveriesInteractor).invoke({ p13nId: "webhook-deliveries-card-store" })
      : Promise.resolve({ ok: true, data: { items: [] } }),
    di.get(GetSubscriptionInteractor).invoke(),
  ]);

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
