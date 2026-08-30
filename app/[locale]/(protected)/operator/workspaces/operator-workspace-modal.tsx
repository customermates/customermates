"use client";

import { observer } from "mobx-react-lite";
import { useFormatter, useTranslations } from "next-intl";
import { SubscriptionPlan, SubscriptionStatus } from "@/generated/prisma";

import { AppCard } from "@/components/card/app-card";
import { CopyableChip } from "@/components/chip/copyable-chip";
import { AppCardBody } from "@/components/card/app-card-body";
import { AppCardHeader } from "@/components/card/app-card-header";
import { AppForm } from "@/components/forms/form-context";
import { FormNumberInput } from "@/components/forms/form-number-input";
import { FormSelect } from "@/components/forms/form-select";
import { AppModal } from "@/components/modal/app-modal";
import { Alert } from "@/components/shared/alert";
import { InfoRow } from "@/components/shared/info-row";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useRootStore } from "@/core/stores/root-store.provider";

import { OperatorFormActions, OperatorFormSection, OperatorReasonField } from "../operator-form-parts";
import { PlanChip, SubscriptionChip } from "../operator-value-labels";

export const OperatorWorkspaceModal = observer(function OperatorWorkspaceModal() {
  const t = useTranslations();
  const format = useFormatter();
  const { operatorWorkspaceModalStore: store } = useRootStore();
  const workspace = store.form.workspace;
  const owner = store.form.owner;
  const planItems = [
    { value: SubscriptionPlan.starter, label: t("OperatorConsole.values.plans.starter") },
    { value: SubscriptionPlan.pro, label: t("OperatorConsole.values.plans.pro") },
    { value: SubscriptionPlan.business, label: t("OperatorConsole.values.plans.business") },
    { value: SubscriptionPlan.enterprise, label: t("OperatorConsole.values.plans.enterprise") },
  ];
  const subscriptionItems = [
    { value: SubscriptionStatus.trial, label: t("OperatorConsole.values.subscription.trial") },
    { value: SubscriptionStatus.active, label: t("OperatorConsole.values.subscription.active") },
    { value: SubscriptionStatus.cancelled, label: t("OperatorConsole.values.subscription.cancelled") },
    { value: SubscriptionStatus.expired, label: t("OperatorConsole.values.subscription.expired") },
    { value: SubscriptionStatus.pastDue, label: t("OperatorConsole.values.subscription.pastDue") },
    { value: SubscriptionStatus.unPaid, label: t("OperatorConsole.values.subscription.unPaid") },
  ];

  return (
    <AppModal size="3xl" store={store} title={t("OperatorWorkspaces.detail.title")}>
      <AppCard>
        <AppCardHeader>
          <div className="min-w-0 grow space-y-1">
            <h2 className="text-x-lg truncate">{workspace?.workspaceLabel ?? t("OperatorWorkspaces.detail.title")}</h2>

            {workspace?.ownerEmail ? (
              <p className="text-x-sm truncate text-muted-foreground">{workspace.ownerEmail}</p>
            ) : null}
          </div>
        </AppCardHeader>

        <AppCardBody>
          {workspace ? (
            <Tabs className="gap-4" value={store.activeTab} onValueChange={store.setActiveTab}>
              <TabsList variant="line">
                <TabsTrigger value="overview">{t("OperatorUsers.tabs.overview")}</TabsTrigger>

                <TabsTrigger value="subscription">{t("OperatorWorkspaces.tabs.subscription")}</TabsTrigger>

                <TabsTrigger value="allowance">{t("OperatorWorkspaces.tabs.allowance")}</TabsTrigger>
              </TabsList>

              <TabsContent className="flex flex-col gap-3" value="overview">
                {workspace.plan || workspace.subscriptionStatus ? (
                  <div className="flex flex-wrap gap-2">
                    <PlanChip plan={workspace.plan} />

                    <SubscriptionChip status={workspace.subscriptionStatus} />
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground">{t("OperatorUsers.values.noSubscription")}</p>
                )}

                <InfoRow label={t("OperatorWorkspaces.detail.workspaceId")}>
                  <CopyableChip size="sm" value={workspace.id} variant="secondary">
                    {workspace.id}
                  </CopyableChip>
                </InfoRow>

                <InfoRow label={t("Common.table.columns.owner")}>{workspace.ownerEmail ?? "-"}</InfoRow>

                <InfoRow label={t("Common.table.columns.members")}>
                  {t("OperatorWorkspaces.values.members", {
                    active: workspace.activeUserCount,
                    total: workspace.userCount,
                  })}
                </InfoRow>

                <InfoRow label={t("OperatorWorkspaces.subscription.seatsLabel")}>
                  {workspace.seats == null ? "-" : format.number(workspace.seats)}
                </InfoRow>

                <InfoRow label={t("Common.table.columns.createdAt")}>
                  {format.dateTime(new Date(workspace.createdAt), { dateStyle: "medium", timeStyle: "short" })}
                </InfoRow>
              </TabsContent>

              <TabsContent value="subscription">
                <OperatorFormSection title={t("OperatorWorkspaces.subscription.title")}>
                  <Alert
                    color="warning"
                    description={t("OperatorWorkspaces.subscription.warningDescription")}
                    title={t("OperatorWorkspaces.subscription.warningTitle")}
                  />

                  {store.isLoading && !owner ? <Skeleton className="h-40 w-full" /> : null}

                  {!store.isLoading && !owner?.subscription ? (
                    <p className="text-sm text-muted-foreground">{t("OperatorWorkspaces.subscription.unavailable")}</p>
                  ) : null}

                  {owner?.subscription ? (
                    <AppForm store={store.subscriptionForm}>
                      <FormSelect required id="plan" items={planItems} label={t("Common.table.columns.plan")} />

                      <FormSelect
                        required
                        id="status"
                        items={subscriptionItems}
                        label={t("Common.table.columns.subscription")}
                      />

                      <div className="space-y-1.5">
                        <FormNumberInput
                          id="quantity"
                          label={t("OperatorWorkspaces.subscription.seatsLabel")}
                          min={1}
                        />

                        <p className="text-xs text-muted-foreground">
                          {t("OperatorWorkspaces.subscription.seatsDescription")}
                        </p>
                      </div>

                      <OperatorReasonField />

                      <OperatorFormActions store={store.subscriptionForm} />
                    </AppForm>
                  ) : null}
                </OperatorFormSection>
              </TabsContent>

              <TabsContent value="allowance">
                <OperatorFormSection title={t("OperatorWorkspaces.allowance.title")}>
                  <Alert
                    color="warning"
                    description={t("OperatorWorkspaces.allowance.warningDescription")}
                    title={t("OperatorWorkspaces.allowance.warningTitle")}
                  />

                  <AppForm store={store.allowanceForm}>
                    <FormNumberInput
                      required
                      id="creditsPerUser"
                      label={t("OperatorWorkspaces.allowance.label")}
                      max={1000000}
                      min={1}
                    />

                    <OperatorReasonField />

                    <OperatorFormActions store={store.allowanceForm} />
                  </AppForm>
                </OperatorFormSection>
              </TabsContent>
            </Tabs>
          ) : null}
        </AppCardBody>
      </AppCard>
    </AppModal>
  );
});
