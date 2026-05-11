"use client";

import type { CustomColumnDto } from "@/features/custom-column/custom-column.schema";

import { Fragment, type ReactNode } from "react";
import { ArrowRight } from "lucide-react";
import { observer } from "mobx-react-lite";
import { useTranslations } from "next-intl";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import deepEqual from "fast-deep-equal/es6";

import { isEmpty, isRelationFieldKey, partitionRelationIds, processChanges } from "./entity-history-details.utils";
import { NotesDiff } from "./notes-diff";

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { AppModal } from "@/components/modal/app-modal";
import { AppCard } from "@/components/card/app-card";
import { AppCardBody } from "@/components/card/app-card-body";
import { AppCardHeader } from "@/components/card/app-card-header";
import { AvatarStack } from "@/components/shared/avatar-stack";
import { AppChipStack } from "@/components/chip/app-chip-stack";
import { CustomFieldValue } from "@/components/data-view/custom-columns/custom-field-value";
import { Icon } from "@/components/shared/icon";
import { serializeJSONToMarkdown } from "@/components/editor/editor.utils";
import { useRootStore } from "@/core/stores/root-store.provider";
import { useEntityHref, useOpenEntity } from "@/components/modal/hooks/use-entity-drawer-stack";
import { EntityType, TaskType } from "@/generated/prisma";
import { getSystemTaskNameTranslationKey } from "@/app/[locale]/(protected)/tasks/components/system-task.config";

type AvatarItem = { id: string; firstName: string; lastName: string; avatarUrl?: string | null; email?: string | null };

function getInitials(firstName: string, lastName: string) {
  return `${firstName?.[0] ?? ""}${lastName?.[0] ?? ""}`.toUpperCase();
}

export const EntityHistoryDetailsModal = observer(() => {
  const t = useTranslations("");
  const { entityHistoryDetailsModalStore: store, intlStore, userModalStore } = useRootStore();
  const openEntity = useOpenEntity();
  const entityHref = useEntityHref();

  if (!store.item) return null;
  const item = store.item;

  function renderValue(key: string, value: unknown, customColumn?: CustomColumnDto): string | JSX.Element {
    if (isEmpty(value)) return t("AuditLogModal.noValue");

    switch (key) {
      case "notes":
        try {
          const markdown = typeof value === "string" ? value : serializeJSONToMarkdown(value as object);
          return (
            <div className="prose prose-xs dark:prose-invert max-w-none">
              <ReactMarkdown remarkPlugins={[remarkGfm]}>{markdown}</ReactMarkdown>
            </div>
          );
        } catch {
          return t("AuditLogModal.noValue");
        }
      case "users":
        return (
          <AvatarStack items={value as AvatarItem[]} onAvatarClick={(user) => void userModalStore.loadById(user.id)} />
        );
      case "contacts":
        return (
          <AvatarStack
            avatarHref={(contact) => entityHref(EntityType.contact, contact.id)}
            items={value as AvatarItem[]}
            onAvatarClick={(contact) => openEntity(EntityType.contact, contact.id)}
          />
        );
      case "organizations":
        return (
          <AppChipStack
            chipHref={(org) => entityHref(EntityType.organization, org.id)}
            items={(value as { id: string; name: string }[]).map((item) => ({ id: item.id, label: item.name }))}
            size="sm"
          />
        );
      case "deals":
        return (
          <AppChipStack
            chipHref={(deal) => entityHref(EntityType.deal, deal.id)}
            items={(value as { id: string; name: string }[]).map((item) => ({ id: item.id, label: item.name }))}
            size="sm"
          />
        );
      case "services":
        return (
          <AppChipStack
            chipHref={(service) => entityHref(EntityType.service, service.id)}
            items={(value as { id: string; name: string; quantity?: number; amount?: number }[]).map((item) => ({
              id: item.id,
              label:
                typeof item.quantity === "number" && typeof item.amount === "number"
                  ? `${item.name} · ${intlStore.formatCurrency(item.amount)} × ${intlStore.formatNumber(item.quantity)}`
                  : item.name,
            }))}
            size="sm"
          />
        );
      case "tasks":
        return (
          <AppChipStack
            chipHref={(task) => entityHref(EntityType.task, task.id)}
            items={(value as { id: string; name: string; type: TaskType }[]).map((task) => {
              const nameKey = getSystemTaskNameTranslationKey(task.type);
              const label = nameKey && task.type !== TaskType.custom ? t(nameKey) : task.name;
              return { id: task.id, label };
            })}
            size="sm"
          />
        );
      case "firstName":
      case "lastName":
      case "name":
        return String(value);
      case "totalValue":
      case "amount":
        return intlStore.formatCurrency(value as number);
      case "totalQuantity":
        return intlStore.formatNumber(value as number);
      default:
        if (customColumn) {
          return (
            <CustomFieldValue
              column={customColumn}
              item={{ id: "history", customFieldValues: [{ columnId: customColumn.id, value: value as string }] }}
            />
          );
        }
        return String(value);
    }
  }

  const customColumnsById = new Map(store.customColumns.map((customColumn) => [customColumn.id, customColumn]));
  const changes = processChanges(item, customColumnsById, t);

  const isCreatedEvent = item.event.endsWith(".created");

  function renderChangeRow(change: (typeof changes)[number]): ReactNode {
    if (isCreatedEvent)
      return <div className="min-w-0">{renderValue(change.key, change.current, change.customColumn)}</div>;

    if (change.key === "notes") return <NotesDiff current={change.current} previous={change.previous} />;

    if (change.key === "customFieldValues" && !change.customColumn)
      return <p className="text-subdued italic">{t("AuditLogModal.deletedFieldChanged")}</p>;

    if (isRelationFieldKey(change.key)) {
      if (!deepEqual(change.previous, change.current)) {
        return (
          <div className="flex flex-wrap items-center gap-2">
            <div className="min-w-0 text-subdued">{renderValue(change.key, change.previous, change.customColumn)}</div>

            <Icon className="text-subdued shrink-0 self-center" icon={ArrowRight} size="sm" />

            <div className="min-w-0">{renderValue(change.key, change.current, change.customColumn)}</div>
          </div>
        );
      }
      return null;
    }

    return (
      <div className="flex flex-wrap items-center gap-2">
        <div className="min-w-0 text-subdued">{renderValue(change.key, change.previous, change.customColumn)}</div>

        <Icon className="text-subdued shrink-0 self-center" icon={ArrowRight} size="sm" />

        <div className="min-w-0">{renderValue(change.key, change.current, change.customColumn)}</div>
      </div>
    );
  }

  function handleClose() {
    store.clear();
    store.close();
  }

  return (
    <AppModal
      size="lg"
      store={store}
      title={t("AuditLogModal.eventAt", {
        event: t(`Common.events.${item.event}`),
        date: intlStore.formatNumericalShortDateTime(item.createdAt),
      })}
      onClose={handleClose}
    >
      <AppCard>
        <AppCardHeader>
          <h2 className="text-x-lg truncate grow">
            {t("AuditLogModal.eventAt", {
              event: t(`Common.events.${item.event}`),
              date: intlStore.formatNumericalShortDateTime(item.createdAt),
            })}
          </h2>

          <Avatar className="shrink-0" size="sm">
            {item.user.avatarUrl && (
              <AvatarImage alt={`${item.user.firstName} ${item.user.lastName}`.trim()} src={item.user.avatarUrl} />
            )}

            <AvatarFallback>{getInitials(item.user.firstName, item.user.lastName)}</AvatarFallback>
          </Avatar>
        </AppCardHeader>

        <AppCardBody>
          <div className="max-h-[60vh] space-y-3 overflow-auto">
            {changes.map((change, index) => {
              const key = `${item.id}-${change.field}-${index}`;

              if (!isCreatedEvent && isRelationFieldKey(change.key)) {
                const { added, removed } = partitionRelationIds(change.previous, change.current);
                if (added.length > 0 || removed.length > 0) {
                  return (
                    <Fragment key={key}>
                      {removed.length > 0 && (
                        <div className="space-y-1">
                          <span className="text-x-xs font-medium text-subdued">
                            {t("AuditLogModal.relationsDeleted", { field: change.field })}
                          </span>

                          <div className="min-w-0 text-x-xs">
                            {renderValue(change.key, removed, change.customColumn)}
                          </div>
                        </div>
                      )}

                      {added.length > 0 && (
                        <div className="space-y-1">
                          <span className="text-x-xs font-medium text-subdued">
                            {t("AuditLogModal.relationsAdded", { field: change.field })}
                          </span>

                          <div className="min-w-0 text-x-xs">{renderValue(change.key, added, change.customColumn)}</div>
                        </div>
                      )}
                    </Fragment>
                  );
                }
              }

              const row = renderChangeRow(change);
              if (row === null) return null;

              return (
                <div key={key} className="space-y-1">
                  <span className="text-x-xs font-medium text-subdued">{change.field}</span>

                  <div className="text-x-xs">{row}</div>
                </div>
              );
            })}
          </div>
        </AppCardBody>
      </AppCard>
    </AppModal>
  );
});
