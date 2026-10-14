import type { DeletionBlocker, DeletionCleanup, DeletionReference } from "./configuration.schema";
import type { ModelIssue } from "./record-model-validation";
import type { RecordModel } from "./record-model.schema";
import type { ConfigurationConsumerCleanup, RecordRepo } from "./record.repo";
import type { DroppedViewReferences } from "@/features/trash/trash.schema";

import { cleanRecordDetailLayout, recordDetailLayoutIsValid } from "./record-detail-layout";
import { cleanRecordEventSubscription, recordEventSubscriptionIsValid } from "./record-event-subscription-validation";
import { cleanRecordMeasure, recordMeasureIsValid } from "./record-measure-validation";
import { expressionFieldDependencies } from "./record-model-validation";
import { fieldValueDefinition } from "./record-configuration-values";
import {
  changedFilterCount,
  cleanRecordViewState,
  invalidRecordViewReference,
  pruneStaleRecordViewColumns,
  recordViewStateIsValid,
} from "./record-view-state";
import { CONFIGURATION_CONSUMER_PAGE } from "./record.repo";

type Rows<K extends keyof RecordRepo> = RecordRepo[K] extends (...args: never[]) => Promise<Array<infer Row>>
  ? AsyncIterable<Row>
  : never;

type ConfigurationConsumers = {
  detailLayouts: Rows<"getDetailLayoutsCompanyWide">;
  viewStates: Rows<"getViewStatesCompanyWide">;
  widgetMeasures: Rows<"getWidgetMeasuresCompanyWide">;
  activityWidgets: Rows<"getActivityWidgetQueriesCompanyWide">;
  eventSubscriptions: Rows<"getEventSubscriptionsCompanyWide">;
};

type ConfigurationImpact = {
  issues: ModelIssue[];
  blockers: DeletionBlocker[];
  cleaned: DeletionCleanup[];
  cleanups: ConfigurationConsumerCleanup[];
  droppedViewReferences: DroppedViewReferences[];
};

export async function* recordPages<T>(
  fetch: (cursor: string | undefined) => Promise<T[]>,
  cursorOf: (row: T) => string,
): AsyncGenerator<T> {
  let cursor: string | undefined;
  for (;;) {
    const rows = await fetch(cursor);
    yield* rows;
    const last = rows.at(-1);
    if (!last || rows.length < CONFIGURATION_CONSUMER_PAGE) return;
    cursor = cursorOf(last);
  }
}

export function configurationTypeChanges(
  current: RecordModel,
  model: RecordModel,
  removedChannelTypeIds: string[] | undefined,
  issues: ModelIssue[],
) {
  const changedTypes = new Set<string>();
  const channelTypes = new Set<string>(removedChannelTypeIds);
  const archivedOnlyTypes = new Set<string>();
  const schemaOnlyTypes = new Set<string>();
  const referenced = (fieldId: string) =>
    model.fields.some(
      (candidate) =>
        !candidate.archived &&
        candidate.behavior.kind !== "input" &&
        expressionFieldDependencies(candidate.behavior.expression).has(fieldId),
    );
  for (const field of model.fields) {
    const before = current.fields.find((candidate) => candidate.id === field.id);
    if (!before && field.behavior.kind === "input" && !field.required && field.behavior.defaultValue === undefined) {
      schemaOnlyTypes.add(field.typeId);
      continue;
    }
    if (before && (before.valueType === "channels") !== (field.valueType === "channels")) {
      issues.push({
        code: "channels_type_change",
        fieldId: field.id,
        typeId: field.typeId,
      });
    }
    if (fieldValueDefinition(before) === fieldValueDefinition(field)) continue;
    if (field.valueType === "channels") {
      channelTypes.add(field.typeId);
      continue;
    }
    if (
      before &&
      (field.behavior.kind === "input" || (field.archived && !before.archived)) &&
      fieldValueDefinition({ ...before, archived: field.archived }) === fieldValueDefinition(field) &&
      !referenced(field.id)
    ) {
      archivedOnlyTypes.add(field.typeId);
      continue;
    }
    changedTypes.add(field.typeId);
  }
  let changed = true;
  while (changed) {
    changed = false;
    for (const field of model.fields) {
      if (
        !changedTypes.has(field.typeId) &&
        field.behavior.kind !== "input" &&
        [...expressionFieldDependencies(field.behavior.expression)].some((id) =>
          changedTypes.has(model.fields.find((candidate) => candidate.id === id)?.typeId ?? ""),
        )
      ) {
        changedTypes.add(field.typeId);
        changed = true;
      }
    }
  }
  const viewTypes = new Set([...changedTypes, ...channelTypes, ...archivedOnlyTypes, ...schemaOnlyTypes]);
  const changedRelations = new Set(
    [...current.relationships, ...model.relationships]
      .filter(
        (relation) =>
          JSON.stringify(current.relationships.find((before) => before.id === relation.id)) !==
          JSON.stringify(model.relationships.find((after) => after.id === relation.id)),
      )
      .map((relation) => relation.id),
  );
  for (const type of model.types) {
    const before = current.types.find((before) => before.id === type.id);
    if (
      JSON.stringify(before) !== JSON.stringify(type) ||
      [...current.relationships, ...model.relationships].some(
        (relation) =>
          changedRelations.has(relation.id) && (relation.sourceTypeId === type.id || relation.targetTypeId === type.id),
      ) ||
      [...(before?.relationshipPaths ?? []), ...(type.relationshipPaths ?? [])].some((path) =>
        path.path.some((step) => changedRelations.has(step.relationId)),
      )
    )
      viewTypes.add(type.id);
  }
  return { changedTypes, viewTypes };
}

export async function collectConsumerImpact(
  current: RecordModel,
  model: RecordModel,
  change: {
    viewTypes: Set<string>;
    deletedTypeIds: Set<string>;
    cause: DeletionReference | null;
  },
  consumers: ConfigurationConsumers,
  impact: ConfigurationImpact,
): Promise<void> {
  const { viewTypes, deletedTypeIds, cause } = change;
  const { issues, blockers, cleaned, cleanups, droppedViewReferences } = impact;
  if (viewTypes.size) {
    const blockedLayouts = new Set<string>();
    for await (const entry of consumers.detailLayouts) {
      if (deletedTypeIds.has(entry.typeId) || recordDetailLayoutIsValid(entry.typeId, entry.layout, model)) continue;
      const layout =
        cause && recordDetailLayoutIsValid(entry.typeId, entry.layout, current)
          ? cleanRecordDetailLayout(entry.typeId, entry.layout, model)
          : null;
      if (cause && layout) {
        cleanups.push({ kind: "detailLayout", id: entry.id, layout });
        cleaned.push({
          consumer: {
            kind: "detailLayout",
            id: entry.id,
            typeId: entry.typeId,
            label: "",
          },
          target: cause,
        });
        continue;
      }
      if (blockedLayouts.has(entry.typeId)) continue;
      blockedLayouts.add(entry.typeId);
      issues.push({ code: "detail_layout_incompatible", typeId: entry.typeId });
    }
    for await (const consumer of consumers.viewStates) {
      if (consumer.trashed) continue;
      if (deletedTypeIds.has(consumer.typeId) || recordViewStateIsValid(consumer.typeId, consumer.state, model))
        continue;
      const kind = consumer.key.startsWith("view:") ? "view" : "personalLayout";
      const id = consumer.key.slice(consumer.key.indexOf(":") + 1);
      const validBefore = recordViewStateIsValid(consumer.typeId, consumer.state, current);
      if (!validBefore) {
        const pruned = pruneStaleRecordViewColumns(consumer.typeId, consumer.state, model);
        if (pruned) {
          cleanups.push({ kind, id, state: pruned });
          continue;
        }
      }
      const state = cause && validBefore ? cleanRecordViewState(consumer.typeId, consumer.state, model) : null;
      if (cause && state) {
        cleanups.push({ kind, id, state });
        if (kind === "view") {
          const restored = { ...consumer.state, ...state };
          const columns = new Set([
            ...(consumer.state.columnOrder ?? []),
            ...(consumer.state.hiddenColumns ?? []),
            ...Object.keys(consumer.state.columnWidths ?? {}),
          ]);
          const kept = new Set([
            ...(restored.columnOrder ?? []),
            ...(restored.hiddenColumns ?? []),
            ...Object.keys(restored.columnWidths ?? {}),
          ]);
          droppedViewReferences.push({
            viewId: id,
            filters: changedFilterCount(consumer.state.filters, restored.filters),
            columns: [...columns].filter((column) => !kept.has(column)).length,
            sort: Boolean(consumer.state.sortDescriptor && !restored.sortDescriptor),
            grouping: Boolean(
              consumer.state.grouping && JSON.stringify(consumer.state.grouping) !== JSON.stringify(restored.grouping),
            ),
          });
        }
        cleaned.push({
          consumer: {
            kind,
            id,
            typeId: consumer.typeId,
            label: consumer.name ?? "",
          },
          target: cause,
        });
        continue;
      }
      issues.push({
        code: "saved_view_incompatible",
        typeId: consumer.typeId,
        viewKind: kind,
        viewId: id,
        viewName: consumer.name ?? "All",
        ...invalidRecordViewReference(consumer.typeId, consumer.state, model, current),
      });
    }
  }
  for await (const widget of consumers.widgetMeasures) {
    if (recordMeasureIsValid(widget.measure, model)) continue;
    if (cause && recordMeasureIsValid(widget.measure, current)) {
      const measure = cleanRecordMeasure(widget.measure, model);
      const consumer = {
        kind: "widget" as const,
        id: widget.id,
        label: widget.name,
      };
      if (measure) {
        cleanups.push({ kind: "widget", id: widget.id, measure });
        const counts = measure.aggregation === "count" && widget.measure.aggregation !== "count";
        if (!widget.trashed) {
          cleaned.push({
            consumer,
            target: cause,
            ...(counts ? { effect: "countsRecords" as const } : {}),
          });
        }
      } else if (!widget.trashed) blockers.push({ reason: "widget", source: consumer, target: cause });
      continue;
    }
    if (widget.trashed) continue;
    issues.push({
      code: "widget_incompatible",
      typeId: widget.measure.source.typeId,
    });
  }
  for await (const { id, name, query, trashed } of consumers.activityWidgets) {
    if (trashed) continue;
    const typeIds = [
      ...query.scope.typeIds,
      ...query.scope.records.map((ref) => ref.typeId),
      ...(query.filters ?? []).flatMap((filter) => (filter.kind === "record" ? [filter.typeId] : [])),
    ];
    for (const typeId of new Set(typeIds)) {
      if (model.types.some((type) => type.id === typeId && !type.archived)) continue;
      if (cause && deletedTypeIds.has(typeId)) {
        blockers.push({
          reason: "widget",
          source: { kind: "widget", id, label: name },
          target: cause,
        });
      } else issues.push({ code: "widget_incompatible", typeId });
    }
  }
  for await (const subscription of consumers.eventSubscriptions) {
    if (recordEventSubscriptionIsValid(subscription, model)) continue;
    if (cause && recordEventSubscriptionIsValid(subscription, current) && subscription.kind === "webhook") {
      const consumer = {
        kind: "webhook" as const,
        id: subscription.id,
        label: subscription.label,
      };
      const { subscription: kept, paused } = cleanRecordEventSubscription(subscription, model);
      cleanups.push({
        kind: "webhookSubscription",
        subscription: kept,
        paused,
      });
      cleaned.push({
        consumer,
        target: cause,
        effect: paused ? "webhookPaused" : "triggerChanged",
      });
      continue;
    }
    if (cause && recordEventSubscriptionIsValid(subscription, current)) {
      blockers.push({
        reason: subscription.kind,
        source: {
          kind: subscription.kind,
          id: subscription.id,
          label: subscription.label,
        },
        target: cause,
      });
      continue;
    }
    issues.push({
      code: "event_subscription_incompatible",
      typeId: subscription.typeId ?? undefined,
    });
  }
}
