"use client";

import { observer } from "mobx-react-lite";
import { useTranslations } from "next-intl";
import type { RecordEditorStore } from "./record-editor.store";
import type { RecordColumn } from "@/features/records/record-columns";
import type { RecordFieldView } from "@/features/records/record-model.schema";
import type { RecordChoice } from "@/features/records/get-record-choices.interactor";
import { recordColumns } from "@/features/records/record-columns";
import { useEntityDetailPersonalization } from "@/components/entity-detail/entity-detail-personalization";
import { EntityDetailSummaryRail } from "@/components/entity-detail/entity-detail-summary";
import { RecordValue } from "./record-value";
import { RecordCell } from "./record-cell";
import { useRecordChoices } from "./record-relationship-editor";
import { RecordChipIcon } from "@/components/records/record-chip-icon";
import { AppChipStack } from "@/components/chip/app-chip-stack";
import { recordLinkColor } from "@/features/records/record-presentation";
import { EntityDetailAvatarSummaryValue } from "@/components/entity-detail/entity-detail-summary";
import { channelDisplayLabel } from "@/ee/messaging/thread-display";
import { ChannelIconStack } from "@/components/shared/channel-icon-stack";
import { useCopyToClipboard } from "@/core/utils/use-copy-to-clipboard";
import { runUserAction } from "@/core/errors/report-application-error";
import { RecordMemberSchema } from "@/features/records/record-model.schema";

const PreviewMemberSchema = RecordMemberSchema.extend({
  avatarUrl: RecordMemberSchema.shape.avatarUrl.default(null),
}).strip();

const RelatedSummary = observer(function RelatedSummary({
  store,
  column,
}: {
  store: RecordEditorStore;
  column: Extract<RecordColumn, { kind: "relationship" | "relationshipPath" }>;
}) {
  const t = useTranslations();
  const typeId =
    column.kind === "relationshipPath"
      ? column.targetTypeId
      : column.direction === "outgoing"
        ? column.relation.targetTypeId
        : column.relation.sourceTypeId;
  const query = useRecordChoices(
    {
      typeId,
      page: 1,
      pageSize: 10,
      ...(store.record
        ? column.kind === "relationshipPath"
          ? { throughPath: { ref: store.record.ref, pathId: column.definition.id } }
          : { linkedTo: { ref: store.record.ref, relationId: column.relation.id, direction: column.direction } }
        : {}),
    },
    store.record !== null && store.isOpen,
    store.record?.version ?? 0,
  );
  const changes =
    column.kind === "relationship"
      ? store.form.linkChanges.filter(
          (change) => change.relationId === column.relation.id && change.direction === column.direction,
        )
      : [];
  const original = query.data?.records ?? [];
  const records: RecordChoice[] = [
    ...original.filter(
      (record) =>
        !changes.some((change) => change.action === "unlink" && change.record.recordId === record.ref.recordId),
    ),
    ...changes
      .filter(
        (change) =>
          change.action === "link" && !original.some((record) => record.ref.recordId === change.record.recordId),
      )
      .map((change) => ({ ref: change.record, title: change.title })),
  ];
  if (query.loading) return <span className="text-muted-foreground">{t("Loading.text")}</span>;
  if (query.failed) return <span className="text-muted-foreground">{t("Common.notifications.unexpectedError")}</span>;
  if (!records.length && !query.data?.total) return "—";
  const items = records.map((record) => ({
    id: record.ref.recordId,
    ref: record.ref,
    startContent: <RecordChipIcon icons={store.presentation.linkIcons} typeId={record.ref.typeId} />,
    label:
      record.title.state === "value" && record.title.value.kind === "text"
        ? record.title.value.value
        : record.title.state === "restricted"
          ? t("RecordModel.restricted")
          : record.title.state === "error"
            ? t("RecordModel.calculationError")
            : t("RecordModel.record"),
  }));
  return (
    <div className="flex min-w-0 items-center gap-1">
      <AppChipStack
        chipLabel={(item) => t("RecordModel.openRecord", { name: item.label })}
        items={items}
        variant={recordLinkColor(store.presentation.linkColors, typeId)}
        onChipClick={(item, trigger) => store.rootStore.recordWorkspaceStore.open(item.ref, trigger)}
      />

      {(query.data?.total ?? 0) > items.length && <span className="shrink-0 text-xs text-muted-foreground">…</span>}
    </div>
  );
});

const SummaryValue = observer(function SummaryValue({
  store,
  column,
}: {
  store: RecordEditorStore;
  column: RecordColumn<RecordFieldView>;
}) {
  const t = useTranslations();
  const copy = useCopyToClipboard();
  const { previewFieldValues } = useEntityDetailPersonalization();
  if (column.kind === "field") {
    return (
      <RecordValue field={column.field} members={store.record?.memberUsers} result={store.previewValue(column.field)} />
    );
  }
  if (column.kind === "relationship" || column.kind === "relationshipPath")
    return <RelatedSummary column={column} store={store} />;
  if (column.kind === "identity") {
    return store.form.identities.length ? (
      <ChannelIconStack
        identifiers={store.form.identities.map((entry, index) => ({
          ...entry,
          id: String(index),
          profileUrl: entry.profileUrl ?? null,
          displayName: entry.displayName ?? null,
        }))}
        onItemClick={(entry) =>
          runUserAction(() => copy(channelDisplayLabel(entry.provider, entry.value, entry.profileUrl)))
        }
      />
    ) : (
      "—"
    );
  }
  if (column.id === "system:assignedTo") {
    const known = [
      ...(previewFieldValues[column.id] ?? []).flatMap((item) => {
        const parsed = PreviewMemberSchema.safeParse(item.data);
        return parsed.success ? [parsed.data] : [];
      }),
      ...(store.record?.assignedUsers ?? []),
      ...(store.rootStore.userStore.user ? [store.rootStore.userStore.user] : []),
    ];
    const users = store.form.assignedUserIds.flatMap((id) => {
      const user = known.find((user) => user.id === id);
      return user ? [user] : [];
    });
    return (
      <span className="flex items-center gap-1">
        {users.length > 0 && (
          <EntityDetailAvatarSummaryValue
            items={users}
            onItemClick={(item) => runUserAction(() => store.rootStore.userModalStore.loadById(item.id))}
          />
        )}

        {users.length < store.form.assignedUserIds.length
          ? t("RecordModel.restricted")
          : users.length === 0
            ? "—"
            : null}
      </span>
    );
  }
  return store.record ? (
    <RecordCell
      relativeTimestamp
      column={column}
      linkColors={store.presentation.linkColors}
      linkIcons={store.presentation.linkIcons}
      record={store.record}
      onOpen={() => undefined}
    />
  ) : (
    "—"
  );
});

export const RecordDetailSummary = observer(function RecordDetailSummary({ store }: { store: RecordEditorStore }) {
  const t = useTranslations();
  const { starredFieldIds } = useEntityDetailPersonalization();
  const columns = new Map(
    recordColumns(store.presentation.typeId, store.presentation.model).map((column) => [column.id, column]),
  );
  const items = starredFieldIds.flatMap((id) => {
    const column = columns.get(id);
    return column
      ? [
          {
            id,
            label:
              column.kind === "system"
                ? t(`RecordModel.${column.label}`)
                : column.kind === "identity"
                  ? t("EntityChannels.heading")
                  : column.label,
            value: <SummaryValue column={column} store={store} />,
          },
        ]
      : [];
  });
  return items.length ? <EntityDetailSummaryRail items={items} /> : null;
});
