"use client";

import type { ReactNode } from "react";
import type { RecordFieldView } from "@/features/records/record-model.schema";
import type { RecordRow } from "@/features/records/record-presentation";
import type { RecordsStore } from "./records.store";

import { observer } from "mobx-react-lite";
import { useTranslations } from "next-intl";
import { CalendarClock, Plus } from "lucide-react";

import { AppChip } from "@/components/chip/app-chip";
import { AppChipStack } from "@/components/chip/app-chip-stack";
import { MemberAvatar, memberName } from "@/components/chip/member-chip";
import { RecordChipIcon } from "@/components/records/record-chip-icon";
import { RecordValueTypeIcon } from "@/components/records/record-value-type-icon";
import { ContactValue } from "@/components/records/contact-value";
import { RecordValue, useRecordValueFormat } from "@/components/records/record-value";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { toChipColor } from "@/constants/chip-colors";
import { useHydratedIntlStore } from "@/core/stores/use-hydrated-intl-store";
import { byChannelGroup } from "@/ee/messaging/provider";
import { getChannelIcon } from "@/ee/messaging/provider-icon";
import { channelContact, channelDisplayLabel } from "@/ee/messaging/thread-display";
import { withFormulaReferences } from "@/features/records/formula-references";
import { recordDisplayName } from "@/features/records/record-display-name";
import { isRecordFieldWritable } from "@/features/records/record-input-value";
import { recordLinkColor } from "@/features/records/record-presentation";

import { type RecordChipColumn, type RecordChipEntry, linkSummary } from "./record-chip-row-model";
import { calculatedFieldLabel } from "./record-inline-field";

export const CHIP_TRIGGER_CLASS =
  "inline-flex max-w-full min-w-0 cursor-pointer rounded-md outline-none focus-visible:ring-2 focus-visible:ring-ring/70";

export function chipPopoverClass(wide: boolean) {
  return wide ? "w-72 p-0" : "w-80 space-y-2 p-3";
}

type LinkColumn = Extract<RecordChipColumn, { kind: "relationship" | "relationshipPath" }>;

export function linkTypeId(column: LinkColumn) {
  if (column.kind === "relationshipPath") return column.targetTypeId;
  return column.direction === "outgoing" ? column.relation.targetTypeId : column.relation.sourceTypeId;
}

export function ChipColumnIcon({
  icons,
  column,
}: {
  icons: Partial<Record<string, string>>;
  column: RecordChipColumn;
}) {
  if (column.kind === "field") return <RecordValueTypeIcon valueType={column.field.valueType} />;
  if (column.kind === "relationship" || column.kind === "relationshipPath")
    return <RecordChipIcon icons={icons} typeId={linkTypeId(column)} />;
  return <RecordValueTypeIcon valueType={column.kind === "system" ? "dateTime" : "text"} />;
}

export function AddChip({ label }: { label: string }) {
  return (
    <AppChip interactive className="border-dashed border-border bg-transparent text-muted-foreground" tooltip={label}>
      <Plus aria-hidden className="size-3" />
    </AppChip>
  );
}

export function RecordChipList({
  entries,
  renderChip,
  children,
}: {
  entries: RecordChipEntry[];
  renderChip: (entry: RecordChipEntry) => ReactNode;
  children?: ReactNode;
}) {
  return (
    <div className="flex min-w-0 flex-wrap items-center gap-1" data-chip-row="">
      {entries.map((entry) => (
        <span
          key={entry.column.id}
          aria-label={entry.column.label}
          className="inline-flex max-w-full min-w-0"
          data-chip-column={entry.column.id}
          role="group"
        >
          {renderChip(entry)}
        </span>
      ))}

      {children}
    </div>
  );
}

function FieldTooltip({ label, children }: { label: string; children: ReactNode }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span className="inline-flex max-w-full min-w-0 items-center gap-1" data-slot="chip-field">
          {children}
        </span>
      </TooltipTrigger>

      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  );
}

export function IdentityChips({ record, field }: { record: RecordRow; field: RecordFieldView }) {
  return (
    <span className="inline-flex max-w-full min-w-0 flex-wrap items-center gap-1">
      {byChannelGroup(record.identities ?? []).map((identity) => {
        const Icon = getChannelIcon(identity.provider);
        const contact = channelContact(identity.provider, identity.value, identity.profileUrl);
        const label =
          channelDisplayLabel(identity.provider, identity.value, identity.profileUrl) ||
          identity.displayName ||
          identity.value;
        return (
          <AppChip key={identity.id} startContent={<Icon className="size-3" />} tooltip={label}>
            <ContactValue
              action={field.format?.onClick ?? "open"}
              kind={contact.kind}
              label={label}
              value={contact.value}
            />
          </AppChip>
        );
      })}
    </span>
  );
}

function ChipLabel({ name, children }: { name?: string; children: ReactNode }) {
  return (
    <span className="inline-flex min-w-0 items-baseline gap-1">
      {name && (
        <span className="max-w-20 shrink-0 truncate font-normal text-muted-foreground" data-chip-part="">
          {name}
        </span>
      )}

      <span className="min-w-0 truncate">{children}</span>
    </span>
  );
}

type ChipPresentation = Pick<RecordsStore["presentation"], "linkColors" | "linkIcons" | "model" | "formulaReferences">;

export const RecordPropertyChipView = observer(function RecordPropertyChipView({
  presentation,
  record,
  entry,
}: {
  presentation: ChipPresentation;
  record: RecordRow;
  entry: RecordChipEntry;
}) {
  const t = useTranslations();
  const intl = useHydratedIntlStore();
  const valueFormat = useRecordValueFormat();
  const { column, showName } = entry;
  const name = showName ? column.label : undefined;
  const { linkColors, linkIcons, model } = presentation;
  if (column.kind === "field") {
    const field = column.field;
    const result = record.fields.find((value) => value.fieldId === field.id)?.result;
    const icon = <RecordValueTypeIcon valueType={field.valueType} />;
    if (result?.state === "value" && result.value.kind === "select") {
      const value = result.value.value;
      const option = field.options.find((candidate) => candidate.id === value);
      return (
        <AppChip startContent={icon} tooltip={field.label} variant={toChipColor(option?.color)}>
          <ChipLabel name={name}>{option?.label ?? t("RecordModel.unavailableOption")}</ChipLabel>
        </AppChip>
      );
    }
    if (result?.state === "value" && result.value.kind === "member") {
      const memberId = result.value.value;
      const member = record.memberUsers.find((user) => user.id === memberId);
      return (
        <AppChip startContent={member ? <MemberAvatar member={member} /> : icon} tooltip={field.label}>
          <ChipLabel name={name}>{member ? memberName(member) : t("RecordModel.member")}</ChipLabel>
        </AppChip>
      );
    }
    if (field.valueType === "channels") return <IdentityChips field={field} record={record} />;
    if (result?.state === "value" && result.value.kind === "selectList") {
      return (
        <FieldTooltip label={field.label}>
          {icon}

          <RecordValue
            field={field}
            files={record.files}
            members={record.memberUsers}
            overflowMenu={false}
            result={result}
          />
        </FieldTooltip>
      );
    }
    if (result?.state === "value" && result.value.kind === "boolean") {
      return (
        <AppChip startContent={icon} tooltip={field.label}>
          {field.label}
        </AppChip>
      );
    }
    return (
      <AppChip
        startContent={icon}
        tooltip={
          isRecordFieldWritable(field)
            ? field.label
            : calculatedFieldLabel(field, withFormulaReferences(model, presentation.formulaReferences), t, valueFormat)
        }
      >
        <ChipLabel name={name}>
          <RecordValue compact field={field} files={record.files} members={record.memberUsers} result={result} />
        </ChipLabel>
      </AppChip>
    );
  }
  if (column.kind === "relationship" || column.kind === "relationshipPath") {
    const summary = linkSummary(record, column);
    if (!summary?.records.length) return null;
    const first = summary.records[0];
    const typeId = first.ref.typeId;
    const list = model.types.find((type) => type.id === typeId);
    const title = recordDisplayName(first.title, list?.label, t);
    const count = Math.max(summary.readableCount, summary.records.length);
    return (
      <AppChip
        data-chip-id={count === 1 ? `${first.ref.typeId}:${first.ref.recordId}` : undefined}
        startContent={<RecordChipIcon icons={linkIcons} typeId={typeId} />}
        tooltip={column.label}
        variant={recordLinkColor(linkColors, typeId)}
      >
        <ChipLabel name={name}>{count === 1 ? title : `${count} ${list?.pluralLabel ?? column.label}`}</ChipLabel>
      </AppChip>
    );
  }
  if (column.kind === "system" && column.id === "system:assignedTo") {
    return (
      <FieldTooltip label={column.label}>
        <AppChipStack
          items={record.assignedUsers.map((member) => ({
            id: member.id,
            label: memberName(member),
            startContent: <MemberAvatar member={member} />,
          }))}
        />
      </FieldTooltip>
    );
  }
  if (column.kind === "system") {
    const instant = column.id === "system:createdAt" ? record.createdAt : record.updatedAt;
    return (
      <AppChip startContent={<CalendarClock aria-hidden className="size-3" />} tooltip={column.label}>
        <ChipLabel name={name}>
          <time dateTime={instant}>{intl.formatDescriptiveShortDate(new Date(instant))}</time>
        </ChipLabel>
      </AppChip>
    );
  }
  return null;
});
