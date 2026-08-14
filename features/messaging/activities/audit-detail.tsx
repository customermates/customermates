"use client";

import type { CustomColumnDto } from "@/features/custom-column/custom-column.schema";
import type { MessagingProvider } from "@/generated/prisma";
import type { ActivityEntryDto } from "@/ee/messaging/activities/activities.schema";

import { Fragment, type ReactNode } from "react";
import { ArrowRight } from "lucide-react";
import { observer } from "mobx-react-lite";
import { useTranslations } from "next-intl";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

import { getProviderIcon } from "@/ee/messaging/provider-icon";
import { channelDisplayLabel } from "@/ee/messaging/thread-display";

import { isEmpty, partitionRelationIds } from "@/features/audit-log/audit-log-changes";
import { NotesDiff } from "@/app/[locale]/(protected)/company/components/audit-log/notes-diff";

import { auditCategory, DetailHeader, IdentityAvatar, TypeBadge } from "./activities-row";
import { AppCard } from "@/components/card/app-card";
import { AppCardBody } from "@/components/card/app-card-body";
import { AvatarStack } from "@/components/shared/avatar-stack";
import { AppChipStack } from "@/components/chip/app-chip-stack";
import { CustomFieldValue } from "@/components/data-view/custom-columns/custom-field-value";
import { Icon } from "@/components/shared/icon";
import { serializeJSONToMarkdown } from "@/components/editor/editor.utils";
import { useRootStore } from "@/core/stores/root-store.provider";
import { useEntityHref, useOpenEntity } from "@/components/entity-detail/hooks/use-entity-drawer-stack";
import { EntityType, TaskType } from "@/generated/prisma";
import { getSystemTaskNameTranslationKey } from "@/app/[locale]/(protected)/tasks/components/system-task.config";
import { useCanonicalColumnLabel } from "@/components/entity-terminology/use-column-label";

type AvatarItem = {
  id: string;
  firstName: string;
  lastName: string;
  avatarUrl?: string | null;
  email?: string | null;
};

function ChangeRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <span className="text-muted-foreground text-xs">{label}</span>

      <div className="mt-1 text-sm">{children}</div>
    </div>
  );
}

type Props = {
  entry: Extract<ActivityEntryDto, { kind: "audit" }>;
  customColumns: CustomColumnDto[];
};

export const AuditDetail = observer(({ entry, customColumns }: Props) => {
  const t = useTranslations();
  const columnLabel = useCanonicalColumnLabel();
  const { intlStore, userModalStore } = useRootStore();
  const openEntity = useOpenEntity();
  const entityHref = useEntityHref();

  function renderValue(key: string, value: unknown, customColumn?: CustomColumnDto): string | JSX.Element {
    if (isEmpty(value)) return t("AuditLogModal.noValue");

    switch (key) {
      case "identifiers":
        return (
          <AppChipStack
            items={(value as { id?: string; provider: MessagingProvider; value: string }[]).map((identifier) => {
              const ProviderIcon = getProviderIcon(identifier.provider);
              return {
                id: identifier.id ?? `${identifier.provider}:${identifier.value}`,
                label: channelDisplayLabel(identifier.provider, identifier.value) || identifier.value,
                startContent: <ProviderIcon className="size-4 shrink-0" />,
              };
            })}
            size="sm"
          />
        );
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
            items={(value as { id: string; name: string }[]).map((item) => ({
              id: item.id,
              label: item.name,
            }))}
            size="sm"
          />
        );
      case "deals":
        return (
          <AppChipStack
            chipHref={(deal) => entityHref(EntityType.deal, deal.id)}
            items={(value as { id: string; name: string }[]).map((item) => ({
              id: item.id,
              label: item.name,
            }))}
            size="sm"
          />
        );
      case "services":
        return (
          <AppChipStack
            chipHref={(service) => entityHref(EntityType.service, service.id)}
            items={(
              value as {
                id: string;
                name: string;
                quantity?: number;
                amount?: number;
              }[]
            ).map((item) => ({
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
              item={{
                id: "history",
                customFieldValues: [{ columnId: customColumn.id, value: value as string }],
              }}
            />
          );
        }
        return String(value);
    }
  }

  const authorName = `${entry.actor.firstName} ${entry.actor.lastName}`.trim();
  const customColumnsById = new Map(customColumns.map((customColumn) => [customColumn.id, customColumn]));
  const changes = entry.changes.map((change) => {
    const customColumn = change.columnId !== undefined ? customColumnsById.get(change.columnId) : undefined;
    return {
      key: change.field,
      field:
        change.columnId !== undefined
          ? (customColumn?.label ?? t("AuditLogModal.deletedField"))
          : columnLabel(change.field),
      previous: change.previous,
      current: change.current,
      customColumn,
    };
  });

  const isCreatedEvent = entry.event.endsWith(".created");

  function renderChangeRow(change: (typeof changes)[number]): ReactNode {
    if (isCreatedEvent)
      return <div className="min-w-0">{renderValue(change.key, change.current, change.customColumn)}</div>;

    if (change.key === "notes") return <NotesDiff current={change.current} previous={change.previous} />;

    if (change.key === "customFieldValues" && !change.customColumn)
      return <p className="text-subdued italic">{t("AuditLogModal.deletedFieldChanged")}</p>;

    return (
      <div className="flex flex-wrap items-center gap-2">
        <div className="min-w-0 text-subdued">{renderValue(change.key, change.previous, change.customColumn)}</div>

        <Icon className="text-subdued shrink-0 self-center" icon={ArrowRight} size="sm" />

        <div className="min-w-0">{renderValue(change.key, change.current, change.customColumn)}</div>
      </div>
    );
  }

  const category = auditCategory(entry.event);

  return (
    <AppCard>
      <DetailHeader
        avatar={
          <IdentityAvatar
            badge={<TypeBadge icon={category.icon} label={t(`Common.events.${entry.event}`)} tone={category.tone} />}
            name={[entry.actor.firstName, entry.actor.lastName]}
            size="xl"
            src={entry.actor.avatarUrl}
          />
        }
        records={entry.records}
        subtitle={`${t(`Common.events.${entry.event}`)} · ${intlStore.formatNumericalShortDateTime(entry.at)}`}
        title={authorName}
      />

      <AppCardBody>
        <div className="flex flex-col gap-4">
          {changes.map((change, index) => {
            const key = `${entry.id}-${change.field}-${index}`;

            if (
              !isCreatedEvent &&
              ["users", "contacts", "organizations", "deals", "services", "tasks", "identifiers"].includes(change.key)
            ) {
              const { added, removed } = partitionRelationIds(change.previous, change.current);
              if (added.length === 0 && removed.length === 0) return null;

              return (
                <Fragment key={key}>
                  {removed.length > 0 && (
                    <ChangeRow
                      label={t("AuditLogModal.relationsDeleted", {
                        field: change.field,
                      })}
                    >
                      {renderValue(change.key, removed, change.customColumn)}
                    </ChangeRow>
                  )}

                  {added.length > 0 && (
                    <ChangeRow
                      label={t("AuditLogModal.relationsAdded", {
                        field: change.field,
                      })}
                    >
                      {renderValue(change.key, added, change.customColumn)}
                    </ChangeRow>
                  )}
                </Fragment>
              );
            }

            const row = renderChangeRow(change);
            if (row === null) return null;

            return (
              <ChangeRow key={key} label={change.field}>
                {row}
              </ChangeRow>
            );
          })}
        </div>
      </AppCardBody>
    </AppCard>
  );
});
