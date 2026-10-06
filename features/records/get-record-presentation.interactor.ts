import { recordChannelsEnabled } from "./record-channels";
import { z } from "zod";
import { getTranslations } from "next-intl/server";

import type { RecordAccessPolicy } from "./record-access";
import type { RecordRepo } from "./record.repo";
import type { RecordModel } from "./record-model.schema";
import type { RecordQuery } from "./record-query.schema";
import type { QueryRecordsInteractor } from "./query-records.interactor";
import type { GetResult } from "@/core/base/base-get.interactor";
import type { DataViewStateRepo } from "@/core/data-view/data-view-state.repo";
import type { RecordRow } from "./record-presentation";
import type { Validated } from "@/core/validation/validation.utils";
import type { Action } from "@/generated/prisma";

import { AuthenticatedInteractor } from "@/core/base/authenticated-interactor";
import { TenantInteractor } from "@/core/decorators/tenant-interactor.decorator";
import { AllowInDemoMode } from "@/core/decorators/allow-in-demo-mode.decorator";
import { Validate } from "@/core/decorators/validate.decorator";
import { runInTransaction } from "@/core/decorators/transaction-runner";
import { GetQueryParamsSchema } from "@/core/base/base-get.schema";
import { ALL_VIEW_KEY, recordSurfaceKey } from "@/core/data-view/data-view-keys";
import { resolveDataViewState } from "@/core/data-view/resolve-data-view-state";
import { fail, failNotFound } from "@/core/validation/interactor-failure-server";
import { CustomErrorCode } from "@/core/validation/validation.types";
import {
  presentationQuery,
  recordDefaults,
  recordFilterableFields,
  presentationFiltersAreValid,
} from "./record-presentation";
import { recordColumns } from "./record-columns";
import { recordGroupableFields } from "./record-grouping";
import { parseRelationshipColumnKey } from "./record-column.schema";
import { resolveRecordPath } from "./record-relationship-path";

export const GetRecordPresentationSchema = z
  .object({ typeId: z.uuid(), params: GetQueryParamsSchema.default({}) })
  .strict();
export type RecordPresentationResult = {
  model: RecordModel;
  typeId: string;
  canManageSchema: boolean;
  systemColumnLabels: Record<"system:createdAt" | "system:updatedAt" | "system:assignedTo" | "system:channels", string>;
  permittedActions: Action[];
  query: RecordQuery;
  result: GetResult<RecordRow>;
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
    private company: { getDetails(): Promise<{ currency: string }> },
  ) {
    super();
  }

  @Validate(GetRecordPresentationSchema)
  async invoke(input: z.infer<typeof GetRecordPresentationSchema>): Validated<RecordPresentationResult> {
    return runInTransaction(
      async () => {
        const [model, policy, viewState, company, t] = await Promise.all([
          this.records.getModel(),
          this.policy.load(),
          this.views.loadSurfaceState(recordSurfaceKey(input.typeId)),
          this.company.getDetails(),
          getTranslations(),
        ]);
        const systemColumnLabels = {
          "system:createdAt": t("RecordModel.createdAt"),
          "system:updatedAt": t("RecordModel.updatedAt"),
          "system:assignedTo": t("RecordModel.assignedTo"),
          "system:channels": t("EntityChannels.heading"),
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
        const pathRelationships = new Set(paths?.flatMap((path) => path.path.map((step) => step.relationId)));
        const relationships = allowedRelationships.filter(
          (relation) =>
            relation.sourceTypeId === type.id ||
            relation.targetTypeId === type.id ||
            pathRelationships.has(relation.id),
        );
        const viewKey = input.params.viewId ?? viewState.activeViewKey ?? ALL_VIEW_KEY;
        const selected = viewState.views.find((view) => view.id === viewKey);
        if (viewKey !== ALL_VIEW_KEY && !selected) return failNotFound(CustomErrorCode.dataViewNotFound);
        const state = resolveDataViewState({
          params: {
            ...input.params,
            pageSize: input.params.pageSize ?? input.params.pagination?.pageSize,
          },
          base: selected?.state ?? viewState.allState,
          defaults: recordDefaults(type),
        });
        if (!presentationFiltersAreValid(state.filters, fields, relationships, type.id, paths))
          return fail(CustomErrorCode.recordValueInvalid, ["filters"]);
        let query;
        try {
          query = presentationQuery(
            type.id,
            fields,
            {
              ...state,
              page: input.params.page ?? input.params.pagination?.page ?? 1,
            },
            company.currency,
            relationships,
            paths,
          );
        } catch {
          return fail(CustomErrorCode.recordValueInvalid);
        }
        const avatarFieldId = model.capabilities
          .find((binding) => binding.kind === "avatar" && binding.typeId === type.id)
          ?.fields.find((field) => field.role === "image")?.fieldId;
        if (avatarFieldId && fields.some((field) => field.id === avatarFieldId))
          query.fields = [...new Set([...(query.fields ?? fields.map((field) => field.id)), avatarFieldId])];

        const selections = recordColumns(type.id, { ...model, relationships })
          .filter((column) => column.kind === "relationship" && !state.hiddenColumns.includes(column.id))
          .flatMap((column) => {
            const selection = parseRelationshipColumnKey(column.id);
            return selection ? [selection] : [];
          });
        const pathSelections = recordColumns(type.id, {
          ...model,
          relationships,
        }).flatMap((column) =>
          column.kind === "relationshipPath" && !state.hiddenColumns.includes(column.id)
            ? [{ pathId: column.definition.id, limit: 3 }]
            : [],
        );
        if (selections.length + pathSelections.length > 32) return fail(CustomErrorCode.recordCalculationBudget);
        query.includeRelationships = selections;
        query.includePaths = pathSelections;
        query.includeIdentities =
          !state.hiddenColumns.includes("system:channels") && recordChannelsEnabled(model, type.id);
        query.grouping = state.grouping ?? undefined;
        query.groupSummaries = state.grouping ? type.defaults.groupSummaries : undefined;
        query.groupPage = state.grouping ? input.params.groupPage : undefined;
        const queried = await this.query.invoke(query);
        if (!queried.ok) return queried;
        const items = queried.data.records.map((record) => ({
          ...record,
          id: record.ref.recordId,
        }));
        const grouping = queried.data.grouping;
        return {
          ok: true as const,
          data: {
            typeId: type.id,
            model: {
              ...model,
              types: [{ ...type, relationshipPaths: paths }],
              fields,
              relationships,
              capabilities: model.capabilities.filter((binding) => binding.typeId === type.id),
              activityPaths: [],
              accessPresets: policy.canManageSchema ? model.accessPresets : [],
            },
            canManageSchema: policy.canManageSchema,
            systemColumnLabels,
            permittedActions: (["create", "readOwn", "readAll", "update", "delete"] as const).filter((action) =>
              policy.allowed(type.id, action),
            ),
            query,
            result: {
              ...state,
              items,
              p13nId: recordSurfaceKey(type.id),
              filterableFields: recordFilterableFields(fields, relationships, type.id, paths).map((field) => ({
                ...field,
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
              views: viewState.views,
              activeViewKey: viewKey,
              allState: viewState.allState,
              viewPersistable: true,
            },
          },
        };
      },
      { readOnly: true, timeout: 30000 },
    );
  }
}
