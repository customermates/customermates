"use client";

import type { ChangeValueDescriptor, ChangeValueLabels } from "./change-value-descriptor";
import type { AppLocale } from "@/i18n/locale-registry";

import { ArrowRight } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useMemo, type ReactNode } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

import { RecordValue } from "@/app/[locale]/(protected)/records/[typeId]/components/record-value";
import { EmptyValue } from "@/components/shared/empty-value";
import { AppChip } from "@/components/chip/app-chip";
import { AppChipStack } from "@/components/chip/app-chip-stack";
import { recordTypeIcon } from "@/components/records/record-type-icon";
import { MemberAvatar, memberName } from "@/components/chip/member-chip";
import { auditEventTone } from "@/components/entity-detail/audit-event-tone";
import { Icon } from "@/components/shared/icon";
import { countryLabelForLocale } from "@/constants/countries";
import { getCurrencyLabel } from "@/constants/currencies";
import { toChipColor } from "@/constants/chip-colors";
import { useHydratedIntlStore } from "@/core/stores/use-hydrated-intl-store";
import { useRootStore } from "@/core/stores/root-store.provider";
import { runUserAction } from "@/core/errors/report-application-error";
import { getProviderIcon } from "@/ee/messaging/provider-icon";
import { channelDisplayLabel } from "@/ee/messaging/thread-display";
import { isEmpty } from "@/features/event/audit-changes";
import { WikiPageKindSchema } from "@/features/wiki/wiki.schema";

const STRUCTURAL_KEYS = new Set(["id", "columnId", "createdAt", "updatedAt"]);
const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;

function isPrimitive(value: unknown): boolean {
  return typeof value === "string" || typeof value === "number" || typeof value === "boolean";
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function humanizeKey(key: string): string {
  const words = key
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/[_-]+/g, " ")
    .trim()
    .split(/\s+/);
  return words.map((word, index) => (index === 0 ? word.charAt(0).toUpperCase() + word.slice(1) : word)).join(" ");
}

function describeInline(value: unknown): string {
  if (isPrimitive(value)) return String(value);
  if (Array.isArray(value)) {
    if (value.every(isPrimitive)) return value.join(", ");
    return value.map((item) => (isPlainObject(item) ? describeEntries(item) : String(item))).join(" · ");
  }
  if (isPlainObject(value)) return describeEntries(value);
  return String(value);
}

function describeEntries(value: Record<string, unknown>): string {
  return Object.entries(value)
    .filter(([entryKey, entryValue]) => !STRUCTURAL_KEYS.has(entryKey) && !isEmpty(entryValue))
    .map(([entryKey, entryValue]) => `${humanizeKey(entryKey)}: ${describeInline(entryValue)}`)
    .join(" · ");
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

export function useChangeValueLabels(): ChangeValueLabels {
  const t = useTranslations();
  const locale = useLocale() as AppLocale;
  const intl = useHydratedIntlStore();
  return useMemo(
    () => ({
      userStatus: (code: string) => (t.has(`Common.userStatuses.${code}`) ? t(`Common.userStatuses.${code}`) : code),
      provider: (code: string) => (t.has(`Common.providers.${code}`) ? t(`Common.providers.${code}`) : code),
      removalReason: (code: string) =>
        t.has(`AccountRemovalReason.${code}`) ? t(`AccountRemovalReason.${code}`) : code,
      legalDocument: (code: string) =>
        t.has(`LegalDocumentNotice.documents.${code}`) ? t(`LegalDocumentNotice.documents.${code}`) : code,
      wikiKind: (code: string) => (WikiPageKindSchema.safeParse(code).success ? t(`Wiki.kind.${code}`) : code),
      event: (code: string) => (t.has(`Common.events.${code}`) ? t(`Common.events.${code}`) : code),
      country: (code: string) => countryLabelForLocale(code, locale),
      currency: (code: string) => getCurrencyLabel(code, locale),
      date: (value: string) =>
        DATE_ONLY.test(value)
          ? intl.formatDescriptiveShortDate(new Date(value), { timeZone: "UTC" })
          : intl.formatDescriptiveShortDateTime(new Date(value)),
      grant: (action: string) => {
        if (action === "readOwn") return `${t("RoleModal.readAccess")}: ${t("RoleModal.readOwn")}`;
        if (action === "readAll") return `${t("RoleModal.readAccess")}: ${t("RoleModal.readAll")}`;
        return t(
          action === "update" ? "RoleModal.edit" : action === "delete" ? "Common.actions.delete" : "RoleModal.create",
        );
      },
      resource: (code: string) => (t.has(`RoleModal.resources.${code}`) ? t(`RoleModal.resources.${code}`) : code),
      formerMember: t("RecordModel.member"),
    }),
    [intl, locale, t],
  );
}

export function ChangeValue({ value }: { value: ChangeValueDescriptor }) {
  const { userModalStore } = useRootStore();
  switch (value.kind) {
    case "empty":
      return <EmptyValue />;
    case "field":
      return <RecordValue wrap field={value.field} result={value.result} />;
    case "choices":
      if (value.choices.length === 1 && !value.choices[0].provider)
        return <AppChip variant={value.choices[0].color ?? "secondary"}>{value.choices[0].label}</AppChip>;
      return (
        <AppChipStack
          items={value.choices.map((choice) => {
            const ProviderIcon = choice.provider ? getProviderIcon(choice.provider) : null;
            return {
              id: choice.id,
              label: choice.provider
                ? channelDisplayLabel(choice.provider, choice.label) || choice.label
                : choice.label,
              ...(ProviderIcon ? { startContent: <ProviderIcon className="size-4 shrink-0" /> } : {}),
            };
          })}
          size="sm"
        />
      );
    case "members":
      return (
        <AppChipStack
          items={value.members.map((member) => ({
            id: member.id,
            label: memberName(member),
            startContent: <MemberAvatar member={member} />,
          }))}
          size="sm"
          onChipClick={(member) => runUserAction(() => userModalStore.loadById(member.id))}
        />
      );
    case "records":
      return (
        <AppChipStack
          items={value.records.map((record) => {
            const RecordIcon = recordTypeIcon(record.icon);
            return {
              id: record.id,
              label: record.label,
              startContent: <RecordIcon aria-hidden className="shrink-0" />,
            };
          })}
          size="sm"
          variant={toChipColor(value.records[0]?.color ?? undefined)}
        />
      );
    case "richText":
      return (
        <div className="prose prose-sm dark:prose-invert max-w-none">
          <ReactMarkdown remarkPlugins={[remarkGfm]}>{value.markdown}</ReactMarkdown>
        </div>
      );
    case "structured":
      return <StructuredValue value={value.value} />;
  }
}

export function InlineChange({ previous, current }: { previous: ReactNode; current: ReactNode }) {
  return (
    <div className="flex items-start gap-2">
      <div className="min-w-0 max-w-[45%] text-subdued">{previous}</div>

      <Icon className="text-subdued mt-1 shrink-0" icon={ArrowRight} size="sm" />

      <div className="min-w-0 flex-1">{current}</div>
    </div>
  );
}

export type AuditChangeKind = "created" | "removed" | "changed";

export function auditChangeKind(event: string): AuditChangeKind {
  const tone = auditEventTone(event);
  return tone === "created" ? "created" : tone === "deleted" ? "removed" : "changed";
}

export function FieldChangeRow({
  label,
  kind,
  previous,
  current,
}: {
  label: string;
  kind: AuditChangeKind;
  previous: ReactNode;
  current: ReactNode;
}) {
  return (
    <ChangeRow label={label}>
      {kind === "changed" ? (
        <InlineChange current={current} previous={previous} />
      ) : (
        <div className="min-w-0 break-words">{kind === "removed" ? previous : current}</div>
      )}
    </ChangeRow>
  );
}

export function ChangeRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <span className="text-muted-foreground text-xs">{label}</span>

      <div className="mt-1 text-sm">{children}</div>
    </div>
  );
}
