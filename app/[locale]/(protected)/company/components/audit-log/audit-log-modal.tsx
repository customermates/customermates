"use client";

import { observer } from "mobx-react-lite";
import { useTranslations } from "next-intl";

import { getEntityName } from "@/features/event/entity-name.utils";
import { XModal } from "@/components/x-modal/x-modal";
import { XCard } from "@/components/x-card/x-card";
import { XCardBody } from "@/components/x-card/x-card-body";
import { XCardHeader } from "@/components/x-card/x-card-header";
import { XInfoRow } from "@/components/x-info-row";
import { useRootStore } from "@/core/stores/root-store.provider";
import { XAvatarStack } from "@/components/x-avatar-stack";
import { XCopyableChip } from "@/components/x-chip/x-copyable-chip";
import { XChip } from "@/components/x-chip/x-chip";
import { XCodeBlockAccordion } from "@/components/x-code-block-accordion";

export const AuditLogModal = observer(() => {
  const t = useTranslations("");
  const { auditLogModalStore: store, intlStore, userModalStore } = useRootStore();
  const auditLog = store.form;

  return (
    <XModal size="xl" store={store}>
      <XCard>
        <XCardHeader>
          <h2 className="text-x-lg grow">{t("AuditLogModal.title")}</h2>
        </XCardHeader>

        <XCardBody>
          {auditLog.event && (
            <XInfoRow label={t("AuditLogModal.entity")}>
              {getEntityName(auditLog.event, auditLog.eventData, t) || "-"}
            </XInfoRow>
          )}

          {auditLog.event && (
            <XInfoRow label={t("AuditLogModal.event")}>
              <XChip size="sm" variant="flat">
                {t(`Common.events.${auditLog.event}`)}
              </XChip>
            </XInfoRow>
          )}

          <XInfoRow label={t("AuditLogModal.entityId")}>
            <XCopyableChip size="sm" value={auditLog.entityId} variant="flat">
              {auditLog.entityId}
            </XCopyableChip>
          </XInfoRow>

          <XInfoRow label={t("AuditLogModal.userId")}>
            <XAvatarStack items={[auditLog.user]} onAvatarClick={(user) => void userModalStore.loadById(user.id)} />
          </XInfoRow>

          <XInfoRow label={t("AuditLogModal.createdAt")}>
            {intlStore.formatNumericalShortDateTime(auditLog.createdAt)}
          </XInfoRow>

          <XCodeBlockAccordion
            code={JSON.stringify(auditLog.eventData, null, 2)}
            title={t("AuditLogModal.eventData")}
          />
        </XCardBody>
      </XCard>
    </XModal>
  );
});
