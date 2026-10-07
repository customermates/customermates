"use client";

import type { ReactNode } from "react";
import type { DragEndEvent } from "@dnd-kit/core";
import type { RecordField, RecordModel, RecordRelationship, RecordType } from "@/features/records/record-model.schema";
import type { RecordRelationshipPath } from "@/features/records/record-relationship-path.schema";
import type { TypeModalStore } from "./type-modal";

import { useId } from "react";
import { observer } from "mobx-react-lite";
import { useTranslations } from "next-intl";
import { closestCenter, DndContext, KeyboardSensor, PointerSensor, useSensor, useSensors } from "@dnd-kit/core";
import {
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { ChevronRight, GripVertical } from "lucide-react";

import { FormActions } from "@/components/card/form-actions";
import { AppForm } from "@/components/forms/form-context";
import { RecordConfigurationPreview } from "@/components/records/record-configuration-preview";
import { RecordOperationProgress } from "@/components/records/record-operation-progress";
import { recordTypeIcon } from "@/components/records/record-type-icon";
import { Button } from "@/components/ui/button";
import { recordChannelsEnabled } from "@/features/records/record-channels";
import { cn } from "@/core/utils/cn";
import { EditorTabs } from "@/components/editor-tabs/editor-tabs";

import { configureCounts, configureFieldSource, configureParentId, configurePathLists } from "./configure-model";
import { ModelChangeRecovery } from "./model-change-recovery";
import { configureCardinality } from "./configure-graph-model";
import { TypeSettingsFields } from "./type-modal";

type ActivityPath = RecordModel["activityPaths"][number];

type Props = {
  model: RecordModel;
  selected: RecordType;
  general: TypeModalStore;
  generalFormId: string;
  canManage: boolean;
  interactive: boolean;
  showArchived: boolean;
  onToggleArchived: () => void;
  onEditField: (field: RecordField) => void;
  onEditRelationship: (relation: RecordRelationship) => void;
  onEditRelationshipPath: (path: RecordRelationshipPath) => void;
  onEditActivity: (path: ActivityPath) => void;
};

function ConfigureGroup({
  title,
  description,
  framed = true,
  children,
}: {
  title: string;
  description?: string;
  framed?: boolean;
  children: ReactNode;
}) {
  return (
    <section aria-label={title} className="flex flex-col gap-3">
      {description && <p className="text-sm text-muted-foreground">{description}</p>}

      {framed ? <div className="overflow-hidden rounded-lg border border-border">{children}</div> : children}
    </section>
  );
}

function RowContent({ label, detail, status }: { label: string; detail?: string; status?: string | null }) {
  return (
    <span className="flex min-w-0 flex-1 flex-col gap-0.5 sm:flex-row sm:items-center sm:gap-4">
      <span className="flex min-w-0 items-center gap-2 sm:w-2/5 sm:shrink-0">
        <span className="truncate text-sm font-medium">{label}</span>

        {status && <span className="shrink-0 text-xs text-muted-foreground">{status}</span>}
      </span>

      {detail && <span className="min-w-0 truncate text-xs text-muted-foreground sm:text-sm">{detail}</span>}
    </span>
  );
}

function ConfigureRow({
  label,
  detail,
  status,
  interactive,
  onOpen,
  leading,
}: {
  label: string;
  detail?: string;
  status?: string | null;
  interactive: boolean;
  onOpen?: () => void;
  leading?: ReactNode;
}) {
  if (!onOpen) {
    return (
      <div className="flex min-h-12 items-center gap-3 px-4 py-2.5">
        {leading}

        <RowContent detail={detail} label={label} status={status} />
      </div>
    );
  }
  return (
    <button
      className="flex min-h-12 w-full items-center gap-3 px-4 py-2.5 text-left transition-colors outline-none hover:bg-accent/60 focus-visible:bg-accent/60 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset disabled:pointer-events-none disabled:opacity-60"
      disabled={!interactive}
      type="button"
      onClick={onOpen}
    >
      {leading}

      <RowContent detail={detail} label={label} status={status} />

      <ChevronRight aria-hidden="true" className="size-4 shrink-0 text-muted-foreground" />
    </button>
  );
}

function SortableField({
  id,
  label,
  enabled,
  children,
}: {
  id: string;
  label: string;
  enabled: boolean;
  children: ReactNode;
}) {
  const t = useTranslations();
  const sortable = useSortable({ id, disabled: !enabled });
  return (
    <li
      ref={sortable.setNodeRef}
      className={cn("group relative bg-card", sortable.isDragging && "z-10 shadow-md")}
      data-configure-field={id}
      style={{
        transform: CSS.Translate.toString(sortable.transform),
        transition: sortable.transition,
      }}
    >
      {enabled && (
        <button
          ref={sortable.setActivatorNodeRef}
          {...sortable.attributes}
          {...sortable.listeners}
          aria-label={`${t("DataView.dragToReorder")}: ${label}`}
          className="absolute top-1/2 left-1 z-10 flex size-7 -translate-y-1/2 cursor-grab touch-none items-center justify-center rounded text-muted-foreground hover:bg-accent hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none active:cursor-grabbing sm:opacity-0 sm:group-hover:opacity-100 sm:focus-visible:opacity-100"
          type="button"
        >
          <GripVertical aria-hidden="true" className="size-3.5" />
        </button>
      )}

      {children}
    </li>
  );
}

const GeneralSummary = observer(function GeneralSummary({ model, type }: { model: RecordModel; type: RecordType }) {
  const t = useTranslations();
  const rows: Array<[string, string]> = [
    [t("RecordModel.name"), type.label],
    [t("RecordModel.pluralName"), type.pluralLabel],
    ...(type.description ? ([[t("RecordModel.description"), type.description]] as Array<[string, string]>) : []),
    [
      t("RecordModel.enableChannels"),
      recordChannelsEnabled(model, type.id) ? t("RecordModel.enabled") : t("RecordModel.disabled"),
    ],
    [t("RecordModel.showInNavigation"), type.navigationVisible ? t("RecordModel.enabled") : t("RecordModel.disabled")],
  ];
  return (
    <dl className="divide-y divide-border">
      {rows.map(([label, value]) => (
        <div key={label} className="flex flex-col gap-0.5 px-4 py-2.5 sm:flex-row sm:gap-4">
          <dt className="text-sm text-muted-foreground sm:w-2/5 sm:shrink-0">{label}</dt>

          <dd className="min-w-0 text-sm break-words">{value}</dd>
        </div>
      ))}
    </dl>
  );
});

export const ConfigureListPane = observer(function ConfigureListPane({
  model,
  selected,
  general,
  generalFormId,
  canManage,
  interactive,
  showArchived,
  onToggleArchived,
  onEditField,
  onEditRelationship,
  onEditRelationshipPath,
  onEditActivity,
}: Props) {
  const t = useTranslations();
  const dndId = useId();
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  );
  const Icon = recordTypeIcon(selected.icon);
  const counts = configureCounts(model, selected.id);
  const parentId = configureParentId(model, selected);
  const parent = parentId ? model.types.find((type) => type.id === parentId) : undefined;
  const editingGeneral = canManage && general.original?.id === selected.id;
  const order = editingGeneral
    ? general.form.fieldOrder
    : model.fields.filter((field) => field.typeId === selected.id).map((field) => field.id);
  const fields = order.flatMap((id) =>
    model.fields.filter(
      (field) => field.id === id && field.typeId === selected.id && (!field.archived || showArchived),
    ),
  );
  const reorderEnabled = editingGeneral && interactive && !general.isDisabled;
  const relations = model.relationships.filter(
    (relation) =>
      (!relation.archived || showArchived) &&
      (relation.sourceTypeId === selected.id || relation.targetTypeId === selected.id),
  );
  const paths = (selected.relationshipPaths ?? []).filter((path) => !path.archived || showArchived);
  const activity = model.activityPaths.filter(
    (path) => path.typeId === selected.id && (!path.archived || showArchived),
  );
  const hasArchivedParts =
    model.fields.some((field) => field.typeId === selected.id && field.archived) ||
    model.relationships.some(
      (relation) =>
        relation.archived && (relation.sourceTypeId === selected.id || relation.targetTypeId === selected.id),
    ) ||
    (selected.relationshipPaths ?? []).some((path) => path.archived) ||
    model.activityPaths.some((path) => path.typeId === selected.id && path.archived);
  const listStatus = selected.archived
    ? t("RecordModel.archived")
    : !selected.embedded && !selected.navigationVisible
      ? t("RecordModel.hiddenList")
      : null;
  const fieldSource = (field: RecordField) => {
    const source = configureFieldSource(model, field);
    switch (source.kind) {
      case "input":
        return t("RecordModel.behaviors.input");
      case "formula":
        return t("RecordModel.fieldSource.formula");
      case "snapshot":
        return t("RecordModel.behaviors.snapshot");
      case "lookup":
        return source.list
          ? t("RecordModel.fieldSource.lookup", { list: source.list })
          : t("RecordModel.behaviors.lookup");
      case "rollup":
        return source.list
          ? t("RecordModel.fieldSource.rollup", { list: source.list })
          : t("RecordModel.behaviors.rollup");
    }
  };
  const handleDragEnd = ({ active, over }: DragEndEvent) => {
    if (!reorderEnabled || !over || active.id === over.id) return;
    general.moveField(String(active.id), String(over.id));
  };
  const empty = <p className="px-4 py-3 text-sm text-muted-foreground">{t("RecordModel.noneYet")}</p>;

  const tabs = (
    <EditorTabs
      syncUrl
      className="flex flex-col"
      contentClassName="flex w-full max-w-3xl flex-col gap-6 p-4 md:p-6"
      label={selected.pluralLabel}
      tabs={[
        {
          id: "general",
          label: t("RecordModel.general"),
          content: (
            <>
              <ConfigureGroup framed={!editingGeneral} title={t("RecordModel.general")}>
                {editingGeneral ? (
                  <TypeSettingsFields idPrefix="configure-general" store={general} />
                ) : (
                  <GeneralSummary model={model} type={selected} />
                )}
              </ConfigureGroup>

              {editingGeneral && <FormActions formId={generalFormId} store={general} />}
            </>
          ),
        },
        {
          id: "fields",
          label: t("RecordModel.fields"),
          content: (
            <ConfigureGroup title={t("RecordModel.fields")}>
              {fields.length ? (
                <DndContext collisionDetection={closestCenter} id={dndId} sensors={sensors} onDragEnd={handleDragEnd}>
                  <SortableContext items={fields.map((field) => field.id)} strategy={verticalListSortingStrategy}>
                    <ul className="divide-y divide-border">
                      {fields.map((field) => (
                        <SortableField
                          key={field.id}
                          enabled={reorderEnabled && !field.archived}
                          id={field.id}
                          label={field.label}
                        >
                          <ConfigureRow
                            detail={`${t(`RecordModel.types.${field.valueType}`)} · ${fieldSource(field)}`}
                            interactive={interactive}
                            label={field.label}
                            leading={canManage ? <span aria-hidden="true" className="w-3 shrink-0" /> : undefined}
                            status={field.archived ? t("RecordModel.archived") : null}
                            onOpen={canManage ? () => onEditField(field) : undefined}
                          />
                        </SortableField>
                      ))}
                    </ul>
                  </SortableContext>
                </DndContext>
              ) : (
                empty
              )}
            </ConfigureGroup>
          ),
        },
        {
          id: "relationships",
          label: t("RecordModel.relationships"),
          content: (
            <ConfigureGroup title={t("RecordModel.relationships")}>
              {relations.length || paths.length ? (
                <ul className="divide-y divide-border">
                  {relations.map((relation) => {
                    const outgoing = relation.sourceTypeId === selected.id;
                    const cardinality = configureCardinality(
                      outgoing
                        ? relation
                        : {
                            sourceCardinality: relation.targetCardinality,
                            targetCardinality: relation.sourceCardinality,
                          },
                    );
                    const other = model.types.find(
                      (type) => type.id === (outgoing ? relation.targetTypeId : relation.sourceTypeId),
                    );
                    return (
                      <li key={relation.id} className="bg-card" data-configure-relationship-row={relation.id}>
                        <ConfigureRow
                          detail={[t(`RecordModel.cardinality.${cardinality}`), other?.pluralLabel]
                            .filter(Boolean)
                            .join(" · ")}
                          interactive={interactive}
                          label={outgoing ? relation.sourceLabel : relation.targetLabel}
                          leading={canManage ? <span aria-hidden="true" className="w-3 shrink-0" /> : undefined}
                          status={relation.archived ? t("RecordModel.archived") : null}
                          onOpen={canManage ? () => onEditRelationship(relation) : undefined}
                        />
                      </li>
                    );
                  })}

                  {paths.map((path) => (
                    <li key={path.id} className="bg-card">
                      <ConfigureRow
                        detail={[
                          t("RecordModel.relationshipPath"),
                          configurePathLists(model, selected.id, path.path).join(" → "),
                        ]
                          .filter(Boolean)
                          .join(" · ")}
                        interactive={interactive}
                        label={path.label}
                        leading={canManage ? <span aria-hidden="true" className="w-3 shrink-0" /> : undefined}
                        status={path.archived ? t("RecordModel.archived") : null}
                        onOpen={canManage ? () => onEditRelationshipPath(path) : undefined}
                      />
                    </li>
                  ))}
                </ul>
              ) : (
                empty
              )}
            </ConfigureGroup>
          ),
        },
        {
          id: "activity",
          label: t("RecordModel.activityConnections"),
          content: (
            <ConfigureGroup
              description={t("RecordModel.activityConnectionsHelp")}
              title={t("RecordModel.activityConnections")}
            >
              {activity.length ? (
                <ul className="divide-y divide-border">
                  {activity.map((path) => (
                    <li key={path.id}>
                      <ConfigureRow
                        detail={
                          configurePathLists(model, selected.id, path.path).join(" → ") || t("RecordModel.thisList")
                        }
                        interactive={interactive}
                        label={path.label}
                        status={path.archived ? t("RecordModel.archived") : null}
                        onOpen={canManage ? () => onEditActivity(path) : undefined}
                      />
                    </li>
                  ))}
                </ul>
              ) : (
                empty
              )}
            </ConfigureGroup>
          ),
        },
      ]}
    />
  );

  return (
    <div className="animate-page-result-in flex w-full flex-col motion-reduce:animate-none" data-configure-list-pane="">
      <div className="flex w-full max-w-3xl items-center justify-between gap-4 p-4 md:p-6">
        <div className="flex min-w-0 items-center gap-3">
          <Icon aria-hidden="true" className="size-5 shrink-0" />

          <div className="min-w-0">
            <h1 className="truncate text-lg font-semibold">{selected.pluralLabel}</h1>

            {parent && (
              <p className="text-sm text-muted-foreground" data-configure-sublist-explanation="">
                {`${t("RecordModel.graph.sublistOf", { list: parent.pluralLabel })} · ${t("RecordModel.sublistExplanation", { parent: parent.label })}`}
              </p>
            )}

            <p className="text-sm text-muted-foreground">
              {t("RecordModel.listCounts", counts)}

              {listStatus ? ` · ${listStatus}` : ""}
            </p>
          </div>
        </div>

        {hasArchivedParts && (
          <Button aria-pressed={showArchived} size="sm" type="button" variant="ghost" onClick={onToggleArchived}>
            {showArchived ? t("RecordModel.hideArchived") : t("RecordModel.showArchived")}
          </Button>
        )}
      </div>

      {editingGeneral && (
        <div className="flex w-full max-w-3xl flex-col gap-4 px-4 empty:hidden md:px-6">
          <ModelChangeRecovery store={general} />

          {general.pendingOperationId && (
            <RecordOperationProgress
              operationId={general.pendingOperationId}
              onCompleted={general.operationCompleted}
              onStopped={general.operationStopped}
            />
          )}

          {general.preview && general.hasUnsavedChanges && (
            <RecordConfigurationPreview
              model={general.model}
              preview={general.preview}
              renewal={general.summaryRenewal}
            />
          )}
        </div>
      )}

      {editingGeneral ? (
        <AppForm id={generalFormId} store={general}>
          {tabs}
        </AppForm>
      ) : (
        tabs
      )}
    </div>
  );
});
