import { recordChannelsField } from "./record-channels";
import { z } from "zod";
import { getTranslations } from "next-intl/server";

import type { FormulaReferences } from "./formula-references";
import type { RecordAccessPolicy } from "./record-access";
import type { RecordRepo } from "./record.repo";
import type { RecordModelView } from "./record-model.schema";
import { formulaReferences } from "./formula-references";
import { visibleFormulaFields } from "./record-formula-visibility";
import type { RecordQuery } from "./record-query.schema";
import type { QueryRecordsInteractor } from "./query-records.interactor";
import type { GetResult } from "@/core/base/base-get.interactor";
import type { DataViewStateRepo } from "@/core/data-view/data-view-state.repo";
import type { Filter } from "@/core/base/base-get.schema";
import type { RecordLinkColors, RecordLinkIcons, RecordLinkLabels, RecordRow } from "./record-presentation";
import type { Validated } from "@/core/validation/validation.utils";
import type { Action } from "@/generated/prisma";

import { AuthenticatedInteractor } from "@/core/base/authenticated-interactor";
import { liveRecordModel } from "./record-model-snapshot";
import { TenantInteractor } from "@/core/decorators/tenant-interactor.decorator";
import { AllowInDemoMode } from "@/core/decorators/allow-in-demo-mode.decorator";
import { Validate } from "@/core/decorators/validate.decorator";
import { runInTransaction } from "@/core/decorators/transaction-runner";
import { GetQueryParamsSchema } from "@/core/base/base-get.schema";
import { recordSurfaceKey } from "@/core/data-view/data-view-keys";
import { selectActiveViewKey } from "@/core/base/base-get.interactor";
import { resolveDataViewState } from "@/core/data-view/resolve-data-view-state";
import { fail, failNotFound, unwoundFailure } from "@/core/validation/interactor-failure-server";
import { CustomErrorCode } from "@/core/validation/validation.types";
import {
  presentationQuery,
  recordDefaults,
  recordFilterableFields,
  recordLinkColors,
  recordLinkIcons,
  recordLinkLabels,
} from "./record-presentation";
import { recordColumns } from "./record-columns";
import { liveGroupSummaries, recordGroupableFields, resolveRecordGrouping } from "./record-grouping";
import { parseRelationshipColumnKey, relationshipPathColumnKey } from "./record-column.schema";
import { recordFilterPaths, resolveRecordPath } from "./record-relationship-path";
import { liveRecordFilters } from "./record-view-state";
import { FilterOperatorKey, ViewMode } from "@/core/base/base-query-builder";
import { CALENDAR_RECORD_LIMIT, type CalendarWindow } from "@/core/data-view/calendar-view-config.schema";
import {
  calendarWindowFilters,
  resolveCalendarFields,
  type CalendarFields,
} from "@/features/record-calendar/record-calendar-query";
import { isRecordSortField } from "./record-query-validation";
import type { RecordQueryResult } from "./record-query-result.schema";
import { RECORD_CONTRIBUTION_FILTER } from "./record-contribution-link";

const GetRecordPresentationSchema = z
  .object({ typeId: z.uuid(), params: GetQueryParamsSchema.default({}), transient: z.boolean().optional() })
  .strict();
const LINKED_PREVIEW_LIMIT = 10;
export type RecordPresentationResult = {
  model: RecordModelView;
  typeId: string;
  canManageSchema: boolean;
  systemColumnLabels: Record<"system:createdAt" | "system:updatedAt" | "system:assignedTo", string>;
  permittedActions: Action[];
  linkColors: RecordLinkColors;
  linkIcons: RecordLinkIcons;
  linkLabels: RecordLinkLabels;
  query: RecordQuery;
  result: GetResult<RecordRow>;
  formulaReferences?: FormulaReferences;
};
@AllowInDemoMode
@TenantInteractor()
export class GetRecordPresentationInteractor extends AuthenticatedInteractor<
  z.infer<typeof GetRecordPresentationSchema>,
  RecordPresentationResult
> {
  constructor(
    private records: RecordRepo,
    private policy: RecordAccessPolicy,
    private views: DataViewStateRepo,
    private query: QueryRecordsInteractor,
  ) {
    super();
  }

  @Validate(GetRecordPresentationSchema)
  async invoke(input: z.infer<typeof GetRecordPresentationSchema>): Validated<RecordPresentationResult> {
    return runInTransaction(
      async () => {
        const [model, policy, viewState, t] = await Promise.all([
          this.records.getModel().then(liveRecordModel),
          this.policy.load(),
          input.transient
            ? Promise.resolve({ views: [], allState: {}, activeViewKey: null })
            : this.views.loadSurfaceState(recordSurfaceKey(input.typeId)),
          getTranslations(),
        ]);
        const systemColumnLabels = {
          "system:createdAt": t("RecordModel.createdAt"),
          "system:updatedAt": t("RecordModel.updatedAt"),
          "system:assignedTo": t("RecordModel.assignedTo"),
        };
        const type = model.types.find((type) => type.id === input.typeId && !type.archived);
        if (!type || !policy.canReadType(type.id)) return failNotFound(CustomErrorCode.recordTypeNotFound);
        const fields = model.fields.filter((field) => field.typeId === type.id && !field.archived);
        const allowedRelationships = model.relationships.filter(
          (relation) =>
            !relation.archived &&
            policy.canReadType(relation.sourceTypeId) &&
            policy.canReadType(relation.targetTypeId),
        );
        const paths = type.relationshipPaths?.filter(
          (path) =>
            !path.archived &&
            resolveRecordPath(type.id, path.path, {
              relationships: allowedRelationships,
            }),
        );
        const filterPaths = recordFilterPaths(
          type.id,
          { types: model.types, relationships: allowedRelationships },
          paths,
        );
        const pathRelationships = new Set(paths?.flatMap((path) => path.path.map((step) => step.relationId)));
        const relationships = allowedRelationships.filter(
          (relation) =>
            relation.sourceTypeId === type.id ||
            relation.targetTypeId === type.id ||
            pathRelationships.has(relation.id),
        );
        const liveState = <T extends { filters?: Filter[] }>(state: T): T =>
          state.filters
            ? { ...state, filters: liveRecordFilters(type.id, state.filters, model, relationships, filterPaths) }
            : state;
        const views = viewState.views.map((view) => ({ ...view, state: liveState(view.state) }));
        const allState = liveState(viewState.allState);
        const viewKey = selectActiveViewKey(
          input.params.viewId,
          viewState.activeViewKey,
          new Map(views.map((view) => [view.id, view])),
        );
        const selected = views.find((view) => view.id === viewKey);
        const state = resolveDataViewState({
          params: {
            ...liveState(input.params),
            pageSize: input.params.pageSize ?? input.params.pagination?.pageSize,
          },
          base: selected?.state ?? allState,
          defaults: recordDefaults(type.id, fields, model.capabilities, type.primaryFieldId),
        });
        if (state.grouping && !resolveRecordGrouping(type.id, state.grouping, model)) state.grouping = undefined;
        const query = presentationQuery(
          type.id,
          fields,
          {
            ...state,
            page: input.params.page ?? input.params.pagination?.page ?? 1,
          },
          relationships,
          filterPaths,
        );
        const avatarFieldId = model.capabilities
          .find((binding) => binding.kind === "avatar" && binding.typeId === type.id)
          ?.fields.find((field) => field.role === "image")?.fieldId;
        if (avatarFieldId && fields.some((field) => field.id === avatarFieldId))
          query.fields = [...new Set([...(query.fields ?? fields.map((field) => field.id)), avatarFieldId])];

        const selections = recordColumns(type.id, { ...model, relationships })
          .filter((column) => column.kind === "relationship" && !state.hiddenColumns.includes(column.id))
          .flatMap((column) => {
            const selection = parseRelationshipColumnKey(column.id);
            return selection ? [{ ...selection, limit: LINKED_PREVIEW_LIMIT }] : [];
          });
        const pathSelections = recordColumns(type.id, {
          ...model,
          relationships,
        }).flatMap((column) =>
          column.kind === "relationshipPath" && !state.hiddenColumns.includes(column.id)
            ? [{ pathId: column.definition.id, limit: LINKED_PREVIEW_LIMIT }]
            : [],
        );
        if (selections.length + pathSelections.length > 32) return fail(CustomErrorCode.recordCalculationBudget);
        query.includeRelationships = selections;
        query.includePaths = pathSelections;
        const channels = recordChannelsField(model, type.id);
        query.includeIdentities = channels?.archived === false && !state.hiddenColumns.includes(channels.id);
        const { summaries, ...queryGrouping } = state.grouping ?? { field: "" };
        const groupSummaries = liveGroupSummaries(type.id, summaries, fields);
        query.grouping = state.grouping ? queryGrouping : undefined;
        query.groupSummaries = state.grouping && groupSummaries.length ? groupSummaries : undefined;
        query.groupPage = state.grouping ? input.params.groupPage : undefined;
        const calendarWindow = input.params.calendarWindow;
        const calendarFields =
          state.viewMode === ViewMode.calendar && state.calendar && calendarWindow
            ? resolveCalendarFields(type.id, state.calendar, fields)
            : null;
        const queried =
          calendarFields && calendarWindow
            ? await this.queryCalendar(query, calendarFields, calendarWindow)
            : await this.query.invoke(query);
        if (!queried.ok) return queried;
        const items = queried.data.records.map((record) => ({
          ...record,
          id: record.ref.recordId,
        }));
        const calendarRange =
          calendarFields && calendarWindow
            ? {
                from: calendarWindow.from,
                to: calendarWindow.to,
                total: queried.data.total,
                truncated: queried.data.total > queried.data.records.length,
              }
            : undefined;
        const grouping =
          queried.data.grouping && summaries !== undefined
            ? {
                ...queried.data.grouping,
                grouping: { ...queried.data.grouping.grouping, summaries: groupSummaries },
              }
            : queried.data.grouping;
        const visibleFields = visibleFormulaFields(fields, model, policy);
        return {
          ok: true as const,
          data: {
            typeId: type.id,
            model: {
              ...model,
              types: [{ ...type, relationshipPaths: paths }],
              fields: visibleFields,
              relationships,
              capabilities: model.capabilities.filter((binding) => binding.typeId === type.id),
              accessPresets: policy.canManageSchema ? model.accessPresets : [],
            },
            formulaReferences: formulaReferences(
              visibleFields,
              model,
              { fields: visibleFields, types: [type], relationships },
              (id) => policy.canReadType(id),
            ),
            canManageSchema: policy.canManageSchema,
            linkColors: recordLinkColors(model.types, relationships),
            linkIcons: recordLinkIcons(model.types, relationships),
            linkLabels: recordLinkLabels(model.types, relationships),
            systemColumnLabels,
            permittedActions: (["create", "readOwn", "readAll", "update", "delete"] as const).filter((action) =>
              policy.allowed(type.id, action),
            ),
            query,
            result: {
              ...state,
              items,
              p13nId: recordSurfaceKey(type.id),
              filterableFields: [
                ...recordFilterableFields(fields, relationships, type.id, filterPaths),
                ...(query.contribution
                  ? [
                      {
                        field: RECORD_CONTRIBUTION_FILTER,
                        label: t("RecordWidgets.contributingRecords"),
                        operators: [FilterOperatorKey.equals],
                      },
                    ]
                  : []),
              ].map((field) => ({
                ...field,
                typeId: filterPaths.find((path) => relationshipPathColumnKey(path.id) === field.field)?.sourceTypeId,
                label:
                  field.field in systemColumnLabels
                    ? systemColumnLabels[field.field as keyof typeof systemColumnLabels]
                    : field.label,
              })),
              grouping,
              groupableFields: recordGroupableFields(
                type.id,
                { ...model, relationships },
                policy.allowed(type.id, "update"),
              ).map((field) => ({
                ...field,
                label:
                  field.grouping.field in systemColumnLabels
                    ? systemColumnLabels[field.grouping.field as keyof typeof systemColumnLabels]
                    : field.label,
              })),
              pagination: {
                page: query.page,
                pageSize: state.pageSize,
                total: queried.data.total,
                totalPages: Math.max(1, Math.ceil(queried.data.total / state.pageSize)),
              },
              views,
              activeViewKey: viewKey,
              allState,
              viewPersistable: true,
              ...(calendarRange ? { calendarRange } : {}),
            },
          },
        };
      },
      { readOnly: true, timeout: 30000 },
    ).catch(unwoundFailure);
  }

  private async queryCalendar(
    query: RecordQuery,
    fields: CalendarFields,
    window: CalendarWindow,
  ): Validated<RecordQueryResult> {
    const filters = calendarWindowFilters(fields, window);
    const calendarQuery: RecordQuery = {
      ...query,
      grouping: undefined,
      groupSummaries: undefined,
      groupPage: undefined,
      page: 1,
      pageSize: CALENDAR_RECORD_LIMIT,
      ...(query.fields
        ? {
            fields: [
              ...new Set([
                ...query.fields,
                ...[fields.start, fields.end, fields.color].flatMap((field) => field?.id ?? []),
              ]),
            ],
          }
        : {}),
      sort: isRecordSortField(fields.start)
        ? [
            { fieldId: fields.start.id, direction: "asc" as const },
            ...query.sort.filter((sort) => sort.fieldId !== fields.start.id),
          ].slice(0, 5)
        : query.sort,
    };
    const starting = await this.query.invoke({ ...calendarQuery, filters: [...query.filters, ...filters.starting] });
    if (!starting.ok || !filters.spanning) return starting;
    const spanning = await this.query.invoke({ ...calendarQuery, filters: [...query.filters, ...filters.spanning] });
    if (!spanning.ok) return spanning;
    return {
      ok: true as const,
      data: {
        ...starting.data,
        records: [...spanning.data.records, ...starting.data.records].slice(0, CALENDAR_RECORD_LIMIT),
        total: starting.data.total + spanning.data.total,
      },
    };
  }
}
