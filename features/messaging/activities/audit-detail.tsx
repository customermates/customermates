"use client";

import type { CustomColumnDto } from "@/features/custom-column/custom-column.schema";
import type { MessagingProvider } from "@/generated/prisma";
import type { ActivityEntryDto } from "@/ee/messaging/activities/activities.schema";

import { Fragment, type ComponentProps, type ReactNode } from "react";
import { ArrowRight } from "lucide-react";
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
import { AvatarStack } from "@/components/shared/avatar-stack";
import { AppChip } from "@/components/chip/app-chip";
import { AppChipStack } from "@/components/chip/app-chip-stack";
import { CustomFieldValue } from "@/components/data-view/custom-columns/custom-field-value";
import { Icon } from "@/components/shared/icon";
import { serializeJSONToMarkdown } from "@/components/editor/editor.utils";
import { useRootStore } from "@/core/stores/root-store.provider";
import { useEntityHref, useOpenEntity } from "@/components/entity-detail/hooks/use-entity-drawer-stack";
import { CustomColumnType, EntityType, TaskType } from "@/generated/prisma";
import { getSystemTaskNameTranslationKey } from "@/app/[locale]/(protected)/tasks/components/system-task.config";
import { useCanonicalColumnLabel } from "@/components/entity-terminology/use-column-label";
import {
  CANONICAL_TERMINOLOGY_PRESET_KEY,
  terminologyMessageKey,
} from "@/features/entity-terminology/entity-terminology.constants";
import { countryLabelForLocale } from "@/constants/countries";
import { getCurrencyLabel } from "@/constants/currencies";
import type { AppLocale } from "@/i18n/locale-registry";
import { runUserAction } from "@/core/errors/report-application-error";

type AvatarItem = {
  id: string;
  firstName: string;
  lastName: string;
  avatarUrl?: string | null;
  email?: string | null;
};

const ISO_DATE_TIME = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/;

const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;

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
  const columnLabel = useCanonicalColumnLabel();
  const { intlStore, userModalStore } = useRootStore();
  const openEntity = useOpenEntity();
  const entityHref = useEntityHref();

  function legalDocumentLabel(document: string): string {
    return t.has(`LegalDocumentNotice.documents.${document}`)
      ? t(`LegalDocumentNotice.documents.${document}`)
      : document;
  }

  function formatDateValue(value: unknown): string {
    if (typeof value !== "string") return String(value);
    if (DATE_ONLY.test(value)) return intlStore.formatNumericalLongDate(new Date(`${value}T00:00:00`));
    if (ISO_DATE_TIME.test(value)) return intlStore.formatNumericalShortDateTime(new Date(value));
    return value;
  }

  function renderValue(key: string, value: unknown, customColumn?: CustomColumnDto): string | JSX.Element {
    if (isEmpty(value)) return t("AuditLogModal.noValue");

    switch (key) {
      case "identifiers":
        return (
          <AppChipStack
            items={(
              value as {
                id?: string;
                provider: MessagingProvider;
                value: string;
              }[]
            ).map((identifier) => {
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
            <div className="prose prose-sm dark:prose-invert max-w-none">
              <ReactMarkdown remarkPlugins={[remarkGfm]}>{markdown}</ReactMarkdown>
            </div>
          );
        } catch {
          return t("AuditLogModal.noValue");
        }
      case "users":
        return (
          <AvatarStack
            items={value as AvatarItem[]}
            onAvatarClick={(user) => runUserAction(() => userModalStore.loadById(user.id))}
          />
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
      case "currency":
        return getCurrencyLabel(String(value), locale);
      case "dealWeightingColumnId":
        return customColumns.find((candidate) => candidate.id === value)?.label ?? t("AuditLogModal.deletedField");
      case "dealStageWeights": {
        const stageOptions = new Map(
          customColumns.flatMap((candidate) =>
            candidate.type === CustomColumnType.singleSelect
              ? (candidate.options?.options ?? []).map((option) => [option.value, option] as const)
              : [],
          ),
        );

        return (
          <div className="flex flex-wrap items-center gap-1.5">
            {(value as { optionValue: string; weight: number }[]).map((stage) => {
              const option = stageOptions.get(stage.optionValue);

              return (
                <AppChip
                  key={stage.optionValue}
                  endContent={
                    <span className="flex shrink-0 items-center gap-1">
                      <span className="opacity-60">·</span>

                      <span className="tabular-nums">{stage.weight}%</span>
                    </span>
                  }
                  size="sm"
                  variant={option?.color}
                >
                  {option?.label ?? t("AuditLogModal.deletedField")}
                </AppChip>
              );
            })}
          </div>
        );
      }
      case "options": {
        const configured = isPlainObject(value) ? value.options : undefined;

        if (!Array.isArray(configured)) return <StructuredValue value={value} />;

        const definitions = configured as {
          value: string;
          label: string;
          color?: ComponentProps<typeof AppChip>["variant"];
          weight?: number;
          isDefault?: boolean;
        }[];

        return (
          <div className="flex flex-wrap items-center gap-1.5">
            {definitions.map((definition) => (
              <AppChip
                key={definition.value}
                endContent={
                  definition.weight === undefined && !definition.isDefault ? undefined : (
                    <span className="flex shrink-0 items-center gap-1">
                      <span className="opacity-60">·</span>

                      <span className="tabular-nums">
                        {definition.weight === undefined
                          ? t("Common.default")
                          : definition.isDefault
                            ? `${definition.weight}% · ${t("Common.default")}`
                            : `${definition.weight}%`}
                      </span>
                    </span>
                  )
                }
                size="sm"
                variant={definition.color}
              >
                {definition.label}
              </AppChip>
            ))}
          </div>
        );
      }
      case "terminology": {
        const selections = value as {
          entityType: EntityType;
          presetKey: string;
        }[];

        return (
          <div className="flex flex-wrap items-center gap-1.5">
            {selections.map((selection) => {
              const presetName = (presetKey: string) =>
                t(terminologyMessageKey(selection.entityType, presetKey, "plural") as never);

              const canonicalName = presetName(CANONICAL_TERMINOLOGY_PRESET_KEY[selection.entityType]);
              const chosenName = presetName(selection.presetKey);

              return (
                <AppChip key={selection.entityType} size="sm">
                  {canonicalName === chosenName ? canonicalName : `${canonicalName} → ${chosenName}`}
                </AppChip>
              );
            })}
          </div>
        );
      }
      case "changedDocuments":
        return (value as string[]).map((document) => legalDocumentLabel(document)).join(", ");
      case "versions":
        return (
          <ul className="space-y-0.5">
            {Object.entries(value as Record<string, unknown>).map(([document, version]) => (
              <li key={document} className="break-words">
                {`${legalDocumentLabel(document)}: ${formatDateValue(version)}`}
              </li>
            ))}
          </ul>
        );
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
        if (typeof value === "string" && (ISO_DATE_TIME.test(value) || DATE_ONLY.test(value)))
          return formatDateValue(value);
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

  const rows = changes.map(renderRow).filter((row) => row !== null);

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
        {rows.length > 0 ? (
          <div className="flex flex-col gap-4">{rows}</div>
        ) : (
          <p className="text-muted-foreground text-sm">{t("EntityTimeline.noFurtherDetail")}</p>
        )}
      </AppCardBody>
    </AppCard>
  );
});
