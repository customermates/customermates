"use client";

import type { GetResult } from "@/core/base/base-get.interactor";
import type { UserRoleDto } from "@/features/role/get-roles.interactor";
import type { AuditLogDto } from "@/ee/audit-log/get/get-audit-logs-by-entity-id.interactor";
import type { WebhookDto } from "@/features/webhook/webhook.schema";
import type { WebhookDeliveryDto } from "@/features/webhook/get-webhook-deliveries.interactor";
import type { UserDto } from "@/features/user/user.schema";

import { useEffect } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { Tab, Tabs } from "@heroui/tabs";

import { UsersCard } from "./user/users-card";
import { RolesCard } from "./role/roles-card";
import { AuditLogsCard } from "./audit-log/audit-logs-card";
import { WebhooksCard } from "./webhook/webhooks-card";
import { WebhookDeliveriesCard } from "./webhook/webhook-deliveries-card";

import { useRootStore } from "@/core/stores/root-store.provider";

type Props = {
  auditLogs: GetResult<AuditLogDto>;
  canAccessAuditLogs: boolean;
  canAccessApi: boolean;
  deliveries: GetResult<WebhookDeliveryDto>;
  isCompanyOnboarding: boolean;
  roles: GetResult<UserRoleDto>;
  users: GetResult<UserDto>;
  webhooks: GetResult<WebhookDto>;
};

export function CompanyManagementTabs({
  users,
  roles,
  auditLogs,
  webhooks,
  deliveries,
  isCompanyOnboarding,
  canAccessAuditLogs,
  canAccessApi,
}: Props) {
  const t = useTranslations("");
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  const { auditLogsStore, rolesStore, usersStore, webhookDeliveriesStore, webhooksStore } = useRootStore();

  useEffect(() => {
    usersStore.setItems(users);
    rolesStore.setItems(roles);
    auditLogsStore.setItems(auditLogs);
    webhooksStore.setItems(webhooks);
    webhookDeliveriesStore.setItems(deliveries);
  }, [auditLogs, deliveries, roles, users, webhooks]);

  const availableTabs = [
    "users",
    "roles",
    ...(canAccessAuditLogs ? ["audit-logs"] : []),
    ...(canAccessApi ? ["webhooks", "webhook-deliveries"] : []),
  ];
  const requestedTab = searchParams.get("tab");
  const selectedTab = requestedTab && availableTabs.includes(requestedTab) ? requestedTab : availableTabs[0];

  useEffect(() => {
    if (requestedTab === selectedTab) return;

    const params = new URLSearchParams(searchParams.toString());
    params.set("tab", selectedTab);

    router.replace(`${pathname}?${params.toString()}`, { scroll: false });
  }, [pathname, requestedTab, router, searchParams, selectedTab]);

  function onTabSelectionChange(key: React.Key) {
    const nextTab = String(key);
    if (!availableTabs.includes(nextTab)) return;

    const params = new URLSearchParams(searchParams.toString());
    params.set("tab", nextTab);

    router.replace(`${pathname}?${params.toString()}`, { scroll: false });
  }

  return (
    <Tabs
      fullWidth
      aria-label={t("UserAvatar.company")}
      classNames={{ panel: "contents", tabList: "bg-content1 shadow-small" }}
      color="primary"
      radius="lg"
      selectedKey={selectedTab}
      onSelectionChange={onTabSelectionChange}
    >
      <Tab key="users" title={t("UsersCard.title")}>
        <UsersCard isCompanyOnboarding={isCompanyOnboarding} />
      </Tab>

      <Tab key="roles" title={t("RolesCard.title")}>
        <RolesCard />
      </Tab>

      {canAccessAuditLogs && (
        <Tab key="audit-logs" title={t("AuditLogsCard.title")}>
          <AuditLogsCard />
        </Tab>
      )}

      {canAccessApi && (
        <Tab key="webhooks" title={t("WebhooksCard.title")}>
          <WebhooksCard />
        </Tab>
      )}

      {canAccessApi && (
        <Tab key="webhook-deliveries" title={t("WebhookDeliveriesCard.title")}>
          <WebhookDeliveriesCard />
        </Tab>
      )}
    </Tabs>
  );
}
