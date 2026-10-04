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
import { useHydratedIntlStore } from "@/core/stores/use-hydrated-intl-store";
import { runUserAction } from "@/core/errors/report-application-error";
import { AvatarStack } from "@/components/shared/avatar-stack";
import { CopyableText } from "@/components/shared/copyable-text";
import { AppChip } from "@/components/chip/app-chip";
import { CodeBlockAccordion } from "@/components/shared/code-block-accordion";
import { extractAuditChanges } from "@/features/audit-log/audit-log-changes";
import { hasNotesDiff, NotesDiff } from "./notes-diff";

export const AuditLogModal = observer(() => {
  const t = useTranslations();
  const { auditLogModalStore: store, userModalStore } = useRootStore();
  const intlStore = useHydratedIntlStore();
  const auditLog = store.form;
  const markdownChange = extractAuditChanges(auditLog.eventData).find(
    (change) => change.field === "markdown" && !change.snapshot && hasNotesDiff(change.previous, change.current),
  );

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
            <CopyableText value={auditLog.entityId} />
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

          {markdownChange ? (
            <section
              aria-label={t("AuditLogModal.fields.markdown")}
              className="min-w-0 space-y-2 whitespace-normal break-words text-left"
            >
              <h3 className="text-xs text-muted-foreground">{t("AuditLogModal.fields.markdown")}</h3>

              <NotesDiff current={markdownChange.current} previous={markdownChange.previous} />
            </section>
          ) : null}

          <CodeBlockAccordion code={JSON.stringify(auditLog.eventData, null, 2)} title={t("AuditLogModal.eventData")} />
        </AppCardBody>
      </AppCard>
    </AppModal>
  );
});
