"use client";

import { useTranslations } from "next-intl";
import type { ActivityEntryDto } from "@/ee/messaging/activities/activities.schema";
import type { RecordField } from "@/features/records/record-model.schema";
import { AppCard } from "@/components/card/app-card";
import { AppCardBody } from "@/components/card/app-card-body";
import { AppChipStack } from "@/components/chip/app-chip-stack";
import { RecordValue } from "@/app/[locale]/(protected)/records/[typeId]/components/record-value";
import { useHydratedIntlStore } from "@/core/stores/use-hydrated-intl-store";
import { DetailHeader, IdentityAvatar, TypeBadge, auditCategory } from "./activities-row";
import { resolveActorName } from "./activity-row-labels";
import { ChangeRow, InlineChange } from "./audit-detail";
import { hasNotesDiff, NotesDiff } from "./notes-diff";

type FieldSide = Extract<ActivityEntryDto, { kind: "record" }>["changes"]["fields"][number]["before"];

function parseDocument(side: FieldSide): unknown {
  if (side?.value.state !== "value" || side.value.value.kind !== "richText") return null;
  try {
    return JSON.parse(side.value.value.documentJson) as unknown;
  } catch {
    return null;
  }
}

type Entry = Omit<Extract<ActivityEntryDto, { kind: "record" }>, "event" | "kind"> & { event: string };

export function RecordAuditDetail({ entry }: { entry: Entry }) {
  const t = useTranslations();
  const intl = useHydratedIntlStore();
  const category = auditCategory(entry.event);
  const identities = entry.changes.identities;
  const noValue = t("AuditLogModal.noValue");
  const chips = (items: Array<{ key: string; label: string }>) =>
    items.length ? <AppChipStack items={items.map(({ key, label }) => ({ id: key, label }))} size="sm" /> : noValue;
  const relationChips = (records: Entry["changes"]["related"][number]["before"]) =>
    records.map((record) => ({ key: `${record.ref.typeId}:${record.ref.recordId}`, label: record.title }));
  const render = (value: Entry["changes"]["fields"][number]["before"]) => {
    if (!value) return noValue;
    const field: RecordField = {
      id: value.fieldId,
      typeId: entry.changes.ref.typeId,
      label: value.label,
      valueType: value.valueType,
      behavior: { kind: "input" },
      required: false,
      archived: false,
      publishedSummary: false,
      position: 0,
      format: value.format,
      options: value.options,
    };
    return <RecordValue field={field} result={value.value} />;
  };
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
        subtitle={`${t(`Common.events.${entry.event}`)} · ${intl.formatNumericalShortDateTime(entry.at)}`}
        title={
          resolveActorName(entry.actor.firstName, entry.actor.lastName, entry.actor.email) ||
          t("RecordModel.systemActor")
        }
      />

      <AppCardBody className="flex flex-col gap-4">
        {entry.changes.fields.map((change) => {
          const label = change.after?.label ?? change.before?.label ?? "";
          const sides = [change.before, change.after];
          const richText =
            sides.some((side) => side?.valueType === "richText") &&
            sides.every((side) => !side || side.value.state === "value");
          const previous = parseDocument(change.before);
          const current = parseDocument(change.after);
          if (richText && !hasNotesDiff(previous, current)) return null;
          return (
            <ChangeRow key={change.fieldId} label={label}>
              {richText ? (
                <NotesDiff current={current} previous={previous} />
              ) : (
                <InlineChange current={render(change.after)} previous={render(change.before)} />
              )}
            </ChangeRow>
          );
        })}

        {entry.changes.assignments && (
          <ChangeRow label={t("RecordModel.assignedMembers")}>
            <InlineChange
              current={entry.changes.assignments.after.length}
              previous={entry.changes.assignments.before.length}
            />
          </ChangeRow>
        )}

        {identities && (
          <ChangeRow label={t("RecordModel.identityChannels")}>
            <InlineChange
              current={chips(identities.after.map((identity) => ({ key: identity.id, label: identity.value })))}
              previous={chips(identities.before.map((identity) => ({ key: identity.id, label: identity.value })))}
            />
          </ChangeRow>
        )}

        {entry.changes.links.length > 0 && (
          <p className="text-sm">{t("RecordModel.relationshipChange", { count: entry.changes.links.length })}</p>
        )}

        {entry.changes.related.map((relation) => (
          <ChangeRow key={relation.label} label={relation.label}>
            <InlineChange
              current={chips(relationChips(relation.after))}
              previous={chips(relationChips(relation.before))}
            />
          </ChangeRow>
        ))}
      </AppCardBody>
    </AppCard>
  );
}
