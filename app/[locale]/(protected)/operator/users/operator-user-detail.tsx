"use client";

import type { OperatorUserCreditPeriodDto, OperatorUserDetailDto } from "@/ee/operator/operator.schema";

import { observer } from "mobx-react-lite";
import { useFormatter, useTranslations } from "next-intl";
import { Status } from "@/generated/prisma";

import { AppChip } from "@/components/chip/app-chip";
import { CopyableChip } from "@/components/chip/copyable-chip";
import { AppForm } from "@/components/forms/form-context";
import { FormNumberInput } from "@/components/forms/form-number-input";
import { FormSelect } from "@/components/forms/form-select";
import { Alert } from "@/components/shared/alert";
import { InfoRow } from "@/components/shared/info-row";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useRootStore } from "@/core/stores/root-store.provider";

import { OperatorFormActions, OperatorFormSection, OperatorReasonField } from "../operator-form-parts";
import { AccountStatusChip, OperatorChip } from "../operator-value-labels";

const OperatorUserOverviewTab = observer(function OperatorUserOverviewTab({ user }: { user: OperatorUserDetailDto }) {
  const t = useTranslations();
  const format = useFormatter();
  const dateTime = (value: string | null) =>
    value
      ? format.dateTime(new Date(value), { dateStyle: "medium", timeStyle: "short" })
      : t("OperatorUsers.values.never");

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap gap-2">
        <AccountStatusChip status={user.status} />

        {user.isPlatformOperator ? <OperatorChip isPlatformOperator /> : null}
      </div>

      <InfoRow label={t("OperatorUsers.detail.userId")}>
        <CopyableChip size="sm" value={user.userId} variant="secondary">
          {user.userId}
        </CopyableChip>
      </InfoRow>

      <InfoRow label={t("OperatorUsers.detail.companyId")}>
        <CopyableChip size="sm" value={user.companyId} variant="secondary">
          {user.companyId}
        </CopyableChip>
      </InfoRow>

      <InfoRow label={t("OperatorUsers.detail.role")}>
        {user.role ? (
          <span className="inline-flex items-center gap-2">
            <span className="truncate">{user.role.name}</span>

            {user.role.isSystemRole ? (
              <AppChip size="sm" variant="secondary">
                {t("OperatorUsers.detail.systemRole")}
              </AppChip>
            ) : null}
          </span>
        ) : (
          t("OperatorUsers.detail.noRole")
        )}
      </InfoRow>

      <InfoRow label={t("Common.filters.fields.emailVerified")}>
        {user.authEmailVerified ? t("OperatorUsers.values.verified") : t("OperatorUsers.values.notVerified")}
      </InfoRow>

      <InfoRow label={t("OperatorUsers.detail.lastActive")}>{dateTime(user.lastActiveAt)}</InfoRow>

      <InfoRow label={t("OperatorUsers.detail.createdAt")}>{dateTime(user.createdAt)}</InfoRow>

      <InfoRow label={t("OperatorUsers.detail.updatedAt")}>{dateTime(user.updatedAt)}</InfoRow>
    </div>
  );
});

const OperatorUserAccessTab = observer(function OperatorUserAccessTab({ user }: { user: OperatorUserDetailDto }) {
  const t = useTranslations();
  const { operatorUserModalStore: store } = useRootStore();
  const statusItems = [
    { value: Status.active, label: t("OperatorUsers.values.accountStatus.active") },
    { value: Status.inactive, label: t("OperatorUsers.values.accountStatus.inactive") },
    { value: Status.pendingAuthorization, label: t("OperatorUsers.values.accountStatus.pendingAuthorization") },
  ];
  const accessItems = [
    { value: "false", label: t("OperatorUsers.platformAccess.revoked") },
    { value: "true", label: t("OperatorUsers.platformAccess.granted") },
  ];

  return (
    <div className="flex flex-col gap-6">
      <OperatorFormSection description={t("OperatorUsers.status.description")} title={t("OperatorUsers.status.title")}>
        <Alert
          color="warning"
          description={t("OperatorUsers.status.adminWarningDescription")}
          title={t("OperatorUsers.status.adminWarningTitle")}
        />

        {user.isCurrentOperator ? (
          <Alert
            color="warning"
            description={t("OperatorUsers.status.currentOperatorDescription")}
            title={t("OperatorUsers.status.currentOperatorTitle")}
          />
        ) : null}

        {!user.statusMutation.allowed ? (
          <Alert
            color="danger"
            description={t("OperatorUsers.status.providerSyncRequiredDescription")}
            title={t("OperatorUsers.status.providerSyncRequiredTitle")}
          />
        ) : null}

        <AppForm store={store.statusForm}>
          <FormSelect
            required
            disabled={store.statusForm.isBlocked}
            id="status"
            items={statusItems}
            label={t("OperatorUsers.status.label")}
          />

          <OperatorReasonField />

          <OperatorFormActions store={store.statusForm} />
        </AppForm>
      </OperatorFormSection>

      <Separator />

      <OperatorFormSection
        description={t("OperatorUsers.platformAccess.description")}
        title={t("OperatorUsers.platformAccess.title")}
      >
        <Alert
          color="warning"
          description={t("OperatorUsers.platformAccess.warningDescription")}
          title={t("OperatorUsers.platformAccess.warningTitle")}
        />

        {user.isCurrentOperator ? (
          <Alert
            color="danger"
            description={t("OperatorUsers.platformAccess.selfDescription")}
            title={t("OperatorUsers.platformAccess.selfTitle")}
          />
        ) : null}

        <AppForm store={store.platformAccessForm}>
          <FormSelect
            required
            disabled={store.platformAccessForm.isBlocked}
            id="isPlatformOperator"
            items={accessItems}
            label={t("OperatorUsers.platformAccess.label")}
          />

          <OperatorReasonField />

          <OperatorFormActions store={store.platformAccessForm} />
        </AppForm>
      </OperatorFormSection>
    </div>
  );
});

function CreditPosition({ creditPeriod }: { creditPeriod: OperatorUserCreditPeriodDto | null }) {
  const t = useTranslations();
  const format = useFormatter();
  const integer = (value: number) => format.number(value, { maximumFractionDigits: 0 });

  if (!creditPeriod) {
    return (
      <Alert
        description={t("OperatorUsers.credits.unavailableDescription")}
        title={t("OperatorUsers.credits.unavailableTitle")}
      />
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <p className="text-xs text-muted-foreground">
        {t("OperatorUsers.credits.period", {
          start: format.dateTime(new Date(creditPeriod.periodStart), { dateStyle: "medium" }),
          end: format.dateTime(new Date(creditPeriod.periodEnd), { dateStyle: "medium" }),
        })}
      </p>

      <InfoRow label={t("OperatorUsers.credits.base")}>{integer(creditPeriod.baseAllowanceCredits)}</InfoRow>

      <InfoRow label={t("OperatorUsers.credits.adjustments")}>{integer(creditPeriod.adjustmentCredits)}</InfoRow>

      <InfoRow label={t("OperatorUsers.credits.effective")}>{integer(creditPeriod.effectiveAllowanceCredits)}</InfoRow>

      <InfoRow label={t("OperatorUsers.credits.charged")}>{integer(creditPeriod.chargedCredits)}</InfoRow>

      <InfoRow label={t("OperatorUsers.credits.reserved")}>{integer(creditPeriod.reservedCredits)}</InfoRow>

      <InfoRow label={t("OperatorUsers.credits.committed")}>{integer(creditPeriod.committedCredits)}</InfoRow>

      <InfoRow label={t("OperatorUsers.credits.remaining")}>{integer(creditPeriod.remainingCredits)}</InfoRow>

      <InfoRow label={t("OperatorUsers.credits.overage")}>{integer(creditPeriod.overageCredits)}</InfoRow>

      {creditPeriod.blockedReason ? <p className="text-xs text-warning">{t("OperatorUsers.credits.blocked")}</p> : null}
    </div>
  );
}

const OperatorUserCreditsTab = observer(function OperatorUserCreditsTab({ user }: { user: OperatorUserDetailDto }) {
  const t = useTranslations();
  const { operatorUserModalStore: store } = useRootStore();
  const modeItems = [
    { value: "baseAllowance", label: t("OperatorUsers.reset.baseAllowance") },
    { value: "zeroBalance", label: t("OperatorUsers.reset.zeroBalance") },
  ];

  return (
    <div className="flex flex-col gap-6">
      <section className="flex flex-col gap-3">
        <h3 className="text-x-sm font-medium">{t("OperatorUsers.credits.title")}</h3>

        <CreditPosition creditPeriod={user.creditPeriod} />
      </section>

      <Alert
        color="warning"
        description={t("OperatorUsers.credits.immutableDescription")}
        title={t("OperatorUsers.credits.immutableTitle")}
      />

      <Separator />

      <OperatorFormSection
        description={t("OperatorUsers.adjustment.description")}
        title={t("OperatorUsers.adjustment.title")}
      >
        <AppForm store={store.creditAdjustmentForm}>
          <div className="space-y-1.5">
            <FormNumberInput
              required
              disabled={store.creditAdjustmentForm.isBlocked}
              id="creditDelta"
              label={t("OperatorUsers.adjustment.deltaLabel")}
              placeholder={t("OperatorUsers.adjustment.deltaPlaceholder")}
            />

            <p className="text-xs text-muted-foreground">{t("OperatorUsers.adjustment.deltaDescription")}</p>
          </div>

          <OperatorReasonField />

          <OperatorFormActions store={store.creditAdjustmentForm} />
        </AppForm>
      </OperatorFormSection>

      <Separator />

      <OperatorFormSection description={t("OperatorUsers.reset.description")} title={t("OperatorUsers.reset.title")}>
        <Alert
          color="warning"
          description={t("OperatorUsers.reset.disclosureDescription")}
          title={t("OperatorUsers.reset.disclosureTitle")}
        />

        <AppForm store={store.creditResetForm}>
          <div className="space-y-1.5">
            <FormSelect
              required
              disabled={store.creditResetForm.isBlocked}
              id="mode"
              items={modeItems}
              label={t("OperatorUsers.reset.modeLabel")}
            />

            <p className="text-xs text-muted-foreground">{t("OperatorUsers.reset.modeDescription")}</p>
          </div>

          <OperatorReasonField />

          <OperatorFormActions store={store.creditResetForm} />
        </AppForm>
      </OperatorFormSection>
    </div>
  );
});

export const OperatorUserDetailPanel = observer(function OperatorUserDetailPanel({
  user,
}: {
  user: OperatorUserDetailDto;
}) {
  const t = useTranslations();
  const { operatorUserModalStore: store } = useRootStore();

  return (
    <Tabs
      className="gap-4"
      data-testid="operator-user-detail"
      value={store.activeTab}
      onValueChange={store.setActiveTab}
    >
      <TabsList variant="line">
        <TabsTrigger value="overview">{t("OperatorUsers.tabs.overview")}</TabsTrigger>

        <TabsTrigger value="access">{t("OperatorUsers.tabs.access")}</TabsTrigger>

        <TabsTrigger value="credits">{t("OperatorUsers.tabs.credits")}</TabsTrigger>
      </TabsList>

      <TabsContent value="overview">
        <OperatorUserOverviewTab user={user} />
      </TabsContent>

      <TabsContent value="access">
        <OperatorUserAccessTab user={user} />
      </TabsContent>

      <TabsContent value="credits">
        <OperatorUserCreditsTab user={user} />
      </TabsContent>
    </Tabs>
  );
});
