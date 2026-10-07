"use client";

import { useTranslations } from "next-intl";
import type { ActivityEntryDto } from "@/ee/messaging/activities/activities.schema";
import { AppCard } from "@/components/card/app-card";
import { AppCardBody } from "@/components/card/app-card-body";
import { useHydratedIntlStore } from "@/core/stores/use-hydrated-intl-store";
import { DetailHeader, IdentityAvatar, TypeBadge, auditCategory } from "./activities-row";
import { resolveActorName } from "./activity-row-labels";
import { ChangeRow, ChangeValue, InlineChange } from "./change-value";
import { membersDescriptor, recordsDescriptor, recordValueDescriptor } from "./change-value-descriptor";
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
  const typeId = entry.changes.ref.typeId;
  const formerMember = t("RecordModel.member");
  const field = (side: FieldSide) => (
    <ChangeValue value={recordValueDescriptor(side, typeId, entry.members, formerMember)} />
  );
  const identityChips = (side: NonNullable<typeof identities>["before"]) => (
    <ChangeValue
      value={
        side.length
          ? {
              kind: "choices",
              choices: side.map((identity) => ({
                id: identity.id,
                label: identity.value,
                provider: identity.provider,
              })),
            }
          : { kind: "empty" }
      }
    />
  );
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
                <InlineChange current={field(change.after)} previous={field(change.before)} />
              )}
            </ChangeRow>
          );
        })}

        {entry.changes.assignments && (
          <ChangeRow label={t("RecordModel.assignedTo")}>
            <InlineChange
              current={
                <ChangeValue value={membersDescriptor(entry.changes.assignments.after, entry.members, formerMember)} />
              }
              previous={
                <ChangeValue value={membersDescriptor(entry.changes.assignments.before, entry.members, formerMember)} />
              }
            />
          </ChangeRow>
        )}

        {identities && (
          <ChangeRow label={t("RecordModel.identityChannels")}>
            <InlineChange current={identityChips(identities.after)} previous={identityChips(identities.before)} />
          </ChangeRow>
        )}

        {entry.changes.links.length > 0 && (
          <p className="text-sm">{t("RecordModel.relationshipChange", { count: entry.changes.links.length })}</p>
        )}

        {entry.changes.related.map((relation) => (
          <ChangeRow key={relation.label} label={relation.label}>
            <InlineChange
              current={<ChangeValue value={recordsDescriptor(relation.after, entry.lists)} />}
              previous={<ChangeValue value={recordsDescriptor(relation.before, entry.lists)} />}
            />
          </ChangeRow>
        ))}
      </AppCardBody>
    </AppCard>
  );
}
