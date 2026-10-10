"use client";

import type { ActivityEntryDto } from "@/ee/messaging/activities/activities.schema";

import { observer } from "mobx-react-lite";
import { useTranslations } from "next-intl";
import { Fragment, type ReactNode } from "react";

import { hasNotesDiff, NotesDiff } from "./notes-diff";
import { partitionRelationIds } from "@/features/event/audit-changes";

import { AppCard } from "@/components/card/app-card";
import { AppCardBody } from "@/components/card/app-card-body";
import { useCanonicalColumnLabel } from "@/components/data-view/use-column-label";
import { useHydratedIntlStore } from "@/core/stores/use-hydrated-intl-store";
import { auditCategory, DetailHeader, IdentityAvatar, TypeBadge } from "./activities-row";
import { auditValueDescriptor } from "./change-value-descriptor";
import {
  auditChangeKind,
  ChangeRow,
  ChangeValue,
  FieldChangeRow,
  InlineChange,
  useChangeValueLabels,
} from "./change-value";

type Props = {
  entry: Extract<ActivityEntryDto, { kind: "audit" | "configuration" }>;
};

export const AuditDetail = observer(({ entry }: Props) => {
  const t = useTranslations();
  const columnLabel = useCanonicalColumnLabel();
  const intlStore = useHydratedIntlStore();
  const labels = useChangeValueLabels();
  const isWikiEvent = entry.event.startsWith("wiki_page.");

  function fieldLabel(field: string): string {
    if (isWikiEvent && field === "kind") return t("Wiki.kind.label");
    if (isWikiEvent && field === "whenToUse") return t("Wiki.whenToUse.label");
    return columnLabel(field);
  }

  const renderValue = (key: string, value: unknown) => (
    <ChangeValue value={auditValueDescriptor(key, value, labels, { isWikiEvent })} />
  );

  const authorName =
    `${entry.actor.firstName} ${entry.actor.lastName}`.trim() || entry.actor.email || t("RecordModel.systemActor");
  const kind = auditChangeKind(entry.event);
  const removal = kind === "removed";
  const changes = entry.changes.map((change) => ({
    key: change.field,
    field: change.label ?? fieldLabel(change.field),
    previous: change.snapshot && removal ? change.current : change.previous,
    current: change.snapshot && removal ? undefined : change.current,
    value: change.current,
    snapshot: change.snapshot === true,
  }));

  function renderChangeRow(change: (typeof changes)[number]): ReactNode {
    if (change.snapshot) return <div className="min-w-0 break-words">{renderValue(change.key, change.value)}</div>;

    if (change.key === "notes" || change.key === "markdown")
      return <NotesDiff current={change.current} previous={change.previous} />;

    return (
      <InlineChange
        current={renderValue(change.key, change.current)}
        previous={renderValue(change.key, change.previous)}
      />
    );
  }

  const category = auditCategory(entry.event);

  const renderRow = (change: (typeof changes)[number], index: number) => {
    const key = `${entry.id}-${change.field}-${index}`;

    if (kind !== "changed") {
      return (
        <FieldChangeRow
          key={key}
          current={renderValue(change.key, change.current)}
          kind={kind}
          label={change.field}
          previous={renderValue(change.key, change.previous)}
        />
      );
    }

    if (
      !change.snapshot &&
      (change.key === "notes" || change.key === "markdown") &&
      !hasNotesDiff(change.previous, change.current)
    )
      return null;

    if (!change.snapshot && ["users", "identifiers"].includes(change.key)) {
      const { added, removed } = partitionRelationIds(change.previous, change.current);
      if (added.length === 0 && removed.length === 0) return null;

      return (
        <Fragment key={key}>
          {removed.length > 0 && (
            <ChangeRow label={t("AuditLogModal.relationsDeleted", { field: change.field })}>
              {renderValue(change.key, removed)}
            </ChangeRow>
          )}

          {added.length > 0 && (
            <ChangeRow label={t("AuditLogModal.relationsAdded", { field: change.field })}>
              {renderValue(change.key, added)}
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
