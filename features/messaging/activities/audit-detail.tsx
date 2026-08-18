"use client";

import type { CustomColumnDto } from "@/features/custom-column/custom-column.schema";
import type { MessagingProvider } from "@/generated/prisma";
import type { ActivityEntryDto } from "@/ee/messaging/activities/activities.schema";

import { Fragment, useState, type ReactNode } from "react";
import { ArrowRight, ChevronDown } from "lucide-react";
import { observer } from "mobx-react-lite";
import { useLocale, useTranslations } from "next-intl";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

import { getProviderIcon } from "@/ee/messaging/provider-icon";
import { channelDisplayLabel } from "@/ee/messaging/thread-display";

import { isEmpty, partitionRelationIds } from "@/features/audit-log/audit-log-changes";
import { hasNotesDiff, NotesDiff } from "@/app/[locale]/(protected)/company/components/audit-log/notes-diff";

import { auditCategory, DetailHeader, IdentityAvatar, TypeBadge } from "./activities-row";
import { AppCard } from "@/components/card/app-card";
import { AppCardBody } from "@/components/card/app-card-body";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { cn } from "@/core/utils/cn";
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
import { countryLabelForLocale } from "@/constants/countries";
import type { AppLocale } from "@/i18n/locale-registry";

type AvatarItem = {
  id: string;
  firstName: string;
  lastName: string;
  avatarUrl?: string | null;
  email?: string | null;
};

const ISO_DATE_TIME = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/;

const BODY_ROW_BUDGET = 8;

function isPrimitive(value: unknown): boolean {
  return typeof value === "string" || typeof value === "number" || typeof value === "boolean";
}

const STRUCTURAL_KEYS = new Set(["id", "columnId", "createdAt", "updatedAt"]);

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function describeEntries(value: Record<string, unknown>): string {
  return Object.entries(value)
    .filter(([entryKey, entryValue]) => !STRUCTURAL_KEYS.has(entryKey) && !isEmpty(entryValue))
    .map(([entryKey, entryValue]) => `${humanizeKey(entryKey)}: ${describeInline(entryValue)}`)
    .join(" \u00B7 ");
}

function describeInline(value: unknown): string {
  if (isPrimitive(value)) return String(value);
  if (Array.isArray(value)) {
    if (value.every(isPrimitive)) return value.join(", ");
    return value.map((item) => (isPlainObject(item) ? describeEntries(item) : String(item))).join(" \u00B7 ");
  }
  if (isPlainObject(value)) return describeEntries(value);
  return String(value);
}

function humanizeKey(key: string): string {
  const words = key
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/[_-]+/g, " ")
    .trim()
    .split(/\s+/);

  return words.map((word, index) => (index === 0 ? word.charAt(0).toUpperCase() + word.slice(1) : word)).join(" ");
}

function StructuredValue({ value }: { value: unknown }) {
  const rows = Array.isArray(value)
    ? value.map((item) => (isPlainObject(item) ? describeEntries(item) : String(item)))
    : isPlainObject(value)
      ? Object.entries(value)
          .filter(([entryKey, entryValue]) => !STRUCTURAL_KEYS.has(entryKey) && !isEmpty(entryValue))
          .map(([entryKey, entryValue]) => `${humanizeKey(entryKey)}: ${describeInline(entryValue)}`)
      : [String(value)];

  const visible = rows.filter((row) => row.length > 0);
  if (visible.length === 0) return <span className="break-words">{JSON.stringify(value)}</span>;
  if (visible.length === 1) return <span className="break-words">{visible[0]}</span>;

  return (
    <ul className="space-y-0.5">
      {visible.map((row) => (
        <li key={row} className="break-words">
          {row}
        </li>
      ))}
    </ul>
  );
}

function formatUnknownValue(value: unknown): string {
  if (isPrimitive(value)) return String(value);
  if (Array.isArray(value) && value.every(isPrimitive)) return value.join(", ");
  return JSON.stringify(value) ?? "";
}

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
  const locale = useLocale() as AppLocale;
  const [customFieldsOpen, setCustomFieldsOpen] = useState(false);
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
      case "country":
        return countryLabelForLocale(String(value), locale);
      case "provider":
        return t.has(`Common.providers.${String(value)}`) ? t(`Common.providers.${String(value)}`) : String(value);
      case "status":
        return t.has(`Common.userStatuses.${String(value)}`)
          ? t(`Common.userStatuses.${String(value)}`)
          : String(value);
      case "type": {
        if (entry.event.startsWith("custom_column.")) {
          return t.has(`Common.customColumnTypes.${String(value)}`)
            ? t(`Common.customColumnTypes.${String(value)}`)
            : String(value);
        }

        const systemTaskKey = getSystemTaskNameTranslationKey(value as TaskType);
        return systemTaskKey ? t(systemTaskKey as never) : String(value);
      }
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
        if (typeof value === "string" && ISO_DATE_TIME.test(value))
          return intlStore.formatNumericalShortDateTime(new Date(value));
        if (!isPrimitive(value) && !(Array.isArray(value) && value.every(isPrimitive)))
          return <StructuredValue value={value} />;
        return formatUnknownValue(value);
    }
  }

  const authorName = `${entry.actor.firstName} ${entry.actor.lastName}`.trim();
  const customColumnsById = new Map(customColumns.map((customColumn) => [customColumn.id, customColumn]));
  const isUninformativeTaskType = (change: { field: string; current: unknown }) =>
    change.field === "type" && entry.event.startsWith("task.") && change.current === TaskType.custom;
  const changes = entry.changes
    .filter((change) => !isUninformativeTaskType(change))
    .map((change) => {
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
        snapshot: change.snapshot === true,
      };
    });

  function renderChangeRow(change: (typeof changes)[number]): ReactNode {
    if (change.snapshot)
      return <div className="min-w-0 break-words">{renderValue(change.key, change.current, change.customColumn)}</div>;

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

  const renderRow = (change: (typeof changes)[number], index: number) => {
    const key = `${entry.id}-${change.field}-${index}`;

    if (!change.snapshot && change.key === "notes" && !hasNotesDiff(change.previous, change.current)) return null;

    if (
      !change.snapshot &&
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

    return (
      <ChangeRow key={key} label={change.field}>
        {renderChangeRow(change)}
      </ChangeRow>
    );
  };

  const isCustomField = (change: (typeof changes)[number]) => change.key === "customFieldValues";
  const primaryRows = changes
    .map((change, index) => (isCustomField(change) ? null : renderRow(change, index)))
    .filter((row) => row !== null);
  const customFieldRows = changes
    .map((change, index) => (isCustomField(change) ? renderRow(change, index) : null))
    .filter((row) => row !== null);
  const collapseCustomFields =
    customFieldRows.length > 1 && primaryRows.length + customFieldRows.length > BODY_ROW_BUDGET;
  const rows = collapseCustomFields ? primaryRows : [...primaryRows, ...customFieldRows];

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
        {rows.length > 0 || collapseCustomFields ? (
          <div className="flex flex-col gap-4">
            {rows}

            {collapseCustomFields && (
              <Collapsible open={customFieldsOpen} onOpenChange={setCustomFieldsOpen}>
                <CollapsibleTrigger className="text-muted-foreground hover:text-foreground focus-visible:ring-ring/50 flex items-center gap-1.5 rounded-sm text-xs focus-visible:outline-none focus-visible:ring-[3px]">
                  <ChevronDown className={cn("size-3.5 transition-transform", customFieldsOpen && "rotate-180")} />

                  {t("AuditLogModal.customFieldCount", { count: customFieldRows.length })}
                </CollapsibleTrigger>

                <CollapsibleContent className="flex flex-col gap-4 pt-4">{customFieldRows}</CollapsibleContent>
              </Collapsible>
            )}
          </div>
        ) : (
          <p className="text-muted-foreground text-sm">{t("EntityTimeline.noFurtherDetail")}</p>
        )}
      </AppCardBody>
    </AppCard>
  );
});
