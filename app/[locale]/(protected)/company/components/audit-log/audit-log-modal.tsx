"use client";

import { observer } from "mobx-react-lite";
import { useTranslations } from "next-intl";

import { getEntityName } from "@/features/event/entity-name.utils";
import { AppModal } from "@/components/modal/app-modal";
import { AppCard } from "@/components/card/app-card";
import { AppCardBody } from "@/components/card/app-card-body";
import { AppCardHeader } from "@/components/card/app-card-header";
import { InfoRow } from "@/components/shared/info-row";
import { useRootStore } from "@/core/stores/root-store.provider";
import { runUserAction } from "@/core/errors/report-application-error";
import { AvatarStack } from "@/components/shared/avatar-stack";
import { CopyableChip } from "@/components/chip/copyable-chip";
import { AppChip } from "@/components/chip/app-chip";
import { CodeBlockAccordion } from "@/components/shared/code-block-accordion";

export const AuditLogModal = observer(() => {
  const t = useTranslations();
  const { auditLogModalStore: store, intlStore, userModalStore } = useRootStore();
  const auditLog = store.form;

  return (
    <AppModal size="xl" store={store} title={t("AuditLogModal.title")}>
      <AppCard>
        <AppCardHeader>
          <h2 className="text-x-lg grow">{t("AuditLogModal.title")}</h2>
        </AppCardHeader>

        <AppCardBody>
          {auditLog.event && (
            <InfoRow label={t("AuditLogModal.entity")}>
              {getEntityName(auditLog.event, auditLog.eventData, t) || "-"}
            </InfoRow>
          )}

          {auditLog.event && (
            <InfoRow label={t("AuditLogModal.event")}>
              <AppChip size="sm" variant="secondary">
                {t(`Common.events.${auditLog.event}`)}
              </AppChip>
            </InfoRow>
          )}

          <InfoRow label={t("AuditLogModal.entityId")}>
            <CopyableChip size="sm" value={auditLog.entityId} variant="secondary">
              {auditLog.entityId}
            </CopyableChip>
          </InfoRow>

          <InfoRow label={t("AuditLogModal.userId")}>
            <AvatarStack
              items={[auditLog.user]}
              onAvatarClick={(user) => runUserAction(() => userModalStore.loadById(user.id))}
            />
          </InfoRow>

          <InfoRow label={t("AuditLogModal.createdAt")}>
            {intlStore.formatNumericalShortDateTime(auditLog.createdAt)}
          </InfoRow>

          <CodeBlockAccordion code={JSON.stringify(auditLog.eventData, null, 2)} title={t("AuditLogModal.eventData")} />
        </AppCardBody>
      </AppCard>
    </AppModal>
  );
});
