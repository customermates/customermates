import type { FilterableField } from "@/core/base/base-get.schema";
import type { SearchableField, SortableField } from "@/core/base/base-query-builder";
import type { GroupableFieldSpec } from "@/core/base/grouping/groupable-field";
import type { QueryParamsPrecheckInteractor } from "@/core/base/query-params-precheck.interactor";
import type { DataViewStateRepo } from "@/core/data-view/data-view-state.repo";
import type { DataViewSurfaceKey } from "@/core/data-view/data-view-keys";
import type { CustomColumnDto } from "@/features/custom-column/custom-column.schema";
import type { EntitlementService } from "@/ee/subscription/entitlement.service";
import type { OperatorAccessService } from "@/ee/operator/operator-access.service";
import type { UpsertDataViewInteractor } from "./upsert-data-view.interactor";
import type { SaveDataViewStateInteractor } from "./save-data-view-state.interactor";
import type { SelectDataViewInteractor } from "./select-data-view.interactor";
import type { DeleteDataViewInteractor } from "./delete-data-view.interactor";
import type { AgentDataViewState, ManageDataViewsData } from "./manage-data-views.schema";
import type { Validated } from "@/core/validation/validation.utils";

import { Action, Resource } from "@/generated/prisma";
import { AuthenticatedInteractor } from "@/core/base/authenticated-interactor";
import { ViewMode } from "@/core/base/base-query-builder";
import { groupableFieldDtos } from "@/core/base/grouping/groupable-field";
import { resolveGrouping } from "@/core/base/grouping/group-axis";
import { ALL_VIEW_KEY, DATA_VIEW_SURFACE_KEYS, SURFACE } from "@/core/data-view/data-view-keys";
import { AllowInDemoMode } from "@/core/decorators/allow-in-demo-mode.decorator";
import { TenantInteractor } from "@/core/decorators/tenant-interactor.decorator";
import { Validate } from "@/core/decorators/validate.decorator";
import { fail, failAuthorization, failNotFound } from "@/core/validation/interactor-failure-server";
import { runPrecheck } from "@/core/validation/run-precheck";
import { CustomErrorCode } from "@/core/validation/validation.types";
import { filterValueKind, TIMELINE_KIND_VIEW_VALUES } from "@/core/types/filter-field-value-kind";
import { FilterFieldKey } from "@/core/types/filter-field-key";
import { DomainEvent } from "@/features/event/domain-events";
import { DATA_VIEW_SURFACES } from "./data-view-surfaces";
import { ActivityFiltersSchema } from "@/ee/messaging/activities/activities.schema";
import { ManageDataViewsSchema } from "./manage-data-views.schema";

export abstract class DataViewConfigurationRepo {
  abstract getSearchableFields(): SearchableField[];
  abstract getSortableFields(): SortableField[];
  abstract getFilterableFields(): Promise<FilterableField[]>;
  abstract getCustomColumns(): Promise<CustomColumnDto[]>;
  abstract getGroupableFields(customColumns?: readonly CustomColumnDto[]): Promise<GroupableFieldSpec[]>;
  setMessagingSourcesEnabled?(enabled: boolean): void;
}

export type DataViewConfigurationSources = Record<DataViewSurfaceKey, DataViewConfigurationRepo>;
export type ManageDataViewsResult = Record<string, unknown>;

@AllowInDemoMode
@TenantInteractor()
export class ManageDataViewsInteractor extends AuthenticatedInteractor<ManageDataViewsData, ManageDataViewsResult> {
  constructor(
    private sources: DataViewConfigurationSources,
    private views: DataViewStateRepo,
    private upsert: UpsertDataViewInteractor,
    private saveState: SaveDataViewStateInteractor,
    private select: SelectDataViewInteractor,
    private remove: DeleteDataViewInteractor,
    private queryPrecheck: QueryParamsPrecheckInteractor,
    private entitlements: EntitlementService,
    private operatorAccess: OperatorAccessService,
  ) {
    super();
  }

  @Validate(ManageDataViewsSchema)
  async invoke(data: ManageDataViewsData): Validated<ManageDataViewsResult> {
    if (data.action === "surfaces") {
      const surfaces = [];
      for (const surfaceKey of DATA_VIEW_SURFACE_KEYS) {
        if (await this.accessDenied(surfaceKey)) continue;
        const { label, path, entityType } = DATA_VIEW_SURFACES[surfaceKey];
        surfaces.push({
          surfaceKey,
          label,
          path,
          ...(entityType ? { entityType } : {}),
        });
      }
      return { ok: true, data: { surfaces } };
    }

    const denied = await this.accessDenied(data.surfaceKey);
    if (denied) return denied;
    const descriptor = DATA_VIEW_SURFACES[data.surfaceKey];
    const location = { surfaceKey: data.surfaceKey, path: descriptor.path };

    if (data.action === "config") {
      const config = await this.configuration(data.surfaceKey);
      return {
        ok: true,
        data: {
          ...location,
          label: descriptor.label,
          entityType: descriptor.entityType,
          supportsSearch: config.supportsSearch,
          viewModes: config.viewModes,
          filterableFields: config.filterableFields.map((field) => {
            const valueKind = filterValueKind(field.field);
            const values =
              field.field === FilterFieldKey.timelineKind.toString()
                ? TIMELINE_KIND_VIEW_VALUES
                : valueKind?.kind === "enum"
                  ? valueKind.values
                  : valueKind?.kind === "event"
                    ? Object.values(DomainEvent)
                    : undefined;
            return { ...field, ...(values ? { values } : {}) };
          }),
          sortableFields: [
            ...config.sortableFields.map(({ field }) => ({ field })),
            ...(data.surfaceKey === SURFACE.entityTimeline ? [] : config.customColumns).map(({ id, label, type }) => ({
              field: id,
              label,
              columnType: type,
            })),
          ],
          customColumns: config.customColumns,
          groupableFields: groupableFieldDtos(config.groupableFields),
          writableStateFields:
            data.surfaceKey === SURFACE.entityTimeline
              ? ["filters", "sortDescriptor"]
              : ["filters", "searchTerm", "sortDescriptor", "pageSize", "viewMode", "grouping"],
        },
      };
    }

    const surfaceState = await this.views.loadSurfaceState(data.surfaceKey);
    if (data.action === "list") return { ok: true, data: { ...location, ...surfaceState } };

    if (data.action === "create") {
      const checked = await this.validateState(data.surfaceKey, data.state);
      if (!checked.ok) return checked;
      const result = await this.upsert.invoke({
        surfaceKey: data.surfaceKey,
        name: data.name,
        state: data.state,
      });
      if (!result.ok) return result;
      return {
        ok: true,
        data: {
          ...location,
          ...result.data,
          viewKey: result.data.id,
          link: this.link(descriptor.path, result.data.id),
          selected: true,
        },
      };
    }

    const owned = surfaceState.views.find((view) => view.id === data.viewKey);
    if (data.viewKey !== ALL_VIEW_KEY && !owned) return failNotFound(CustomErrorCode.dataViewNotFound, ["viewKey"]);

    if (data.action === "select") {
      const result = await this.select.invoke({
        surfaceKey: data.surfaceKey,
        viewKey: data.viewKey,
      });
      if (!result.ok) return result;
      return {
        ok: true,
        data: {
          ...location,
          viewKey: data.viewKey,
          selected: true,
          link: this.link(descriptor.path, data.viewKey),
        },
      };
    }
    if (data.action === "delete") {
      const result = await this.remove.invoke({ id: data.viewKey });
      if (!result.ok) return result;
      return {
        ok: true,
        data: { ...location, viewKey: data.viewKey, deleted: true },
      };
    }

    if (data.viewKey === ALL_VIEW_KEY && data.name !== undefined)
      return fail(CustomErrorCode.dataViewAllNameImmutable, ["name"]);

    const state = data.state ?? {};
    const checked = await this.validateState(data.surfaceKey, state);
    if (!checked.ok) return checked;
    if (owned) {
      const result = await this.upsert.invoke({
        id: owned.id,
        surfaceKey: data.surfaceKey,
        ...(data.name !== undefined ? { name: data.name } : {}),
        state,
      });
      if (!result.ok) return result;
      return {
        ok: true,
        data: {
          ...location,
          ...result.data,
          viewKey: owned.id,
          link: this.link(descriptor.path, owned.id),
        },
      };
    }
    const result = await this.saveState.invoke({
      surfaceKey: data.surfaceKey,
      viewKey: ALL_VIEW_KEY,
      state,
    });
    if (!result.ok) return result;
    return {
      ok: true,
      data: {
        ...location,
        viewKey: ALL_VIEW_KEY,
        state: { ...surfaceState.allState, ...state },
        link: this.link(descriptor.path, ALL_VIEW_KEY),
      },
    };
  }

  private hasRead(resource: Resource, readAllOnly = false): boolean {
    return Boolean(
      this.user.role?.isSystemRole ||
        this.user.role?.permissions.some(
          (permission) =>
            permission.resource === resource &&
            (permission.action === Action.readAll || (!readAllOnly && permission.action === Action.readOwn)),
        ),
    );
  }

  private async accessDenied(surfaceKey: DataViewSurfaceKey) {
    const descriptor = DATA_VIEW_SURFACES[surfaceKey];
    if (descriptor.operator && !(await this.operatorAccess.isEligible()))
      return failAuthorization(CustomErrorCode.permissionDenied, ["surfaceKey"]);

    if (descriptor.resource && !this.hasRead(descriptor.resource, descriptor.readAllOnly))
      return failAuthorization(CustomErrorCode.permissionDenied, ["surfaceKey"]);

    if (descriptor.messaging) return this.entitlements.require("messaging");
    if (surfaceKey === SURFACE.entityTimeline) {
      const messaging = this.hasRead(Resource.inboxMessages) && !(await this.entitlements.require("messaging"));
      this.sources[surfaceKey].setMessagingSourcesEnabled?.(messaging);
      if (!messaging && !this.hasRead(Resource.auditLog, true))
        return failAuthorization(CustomErrorCode.permissionDenied, ["surfaceKey"]);
    }
    return null;
  }

  private async configuration(surfaceKey: DataViewSurfaceKey) {
    const source = this.sources[surfaceKey];
    const [customColumns, filterableFields] = await Promise.all([
      source.getCustomColumns(),
      source.getFilterableFields(),
    ]);
    const groupableFields = await source.getGroupableFields(customColumns);
    return {
      customColumns,
      filterableFields,
      sortableFields: source.getSortableFields(),
      groupableFields,
      supportsSearch: source.getSearchableFields().length > 0,
      viewModes:
        DATA_VIEW_SURFACES[surfaceKey].entityType || groupableFields.length > 0
          ? [ViewMode.table, ViewMode.card]
          : [ViewMode.table],
    };
  }

  private async validateState(surfaceKey: DataViewSurfaceKey, state: AgentDataViewState) {
    const config = await this.configuration(surfaceKey);
    return runPrecheck(state, async (input, ctx) => {
      if (surfaceKey === SURFACE.entityTimeline) {
        for (const field of Object.keys(input)) {
          if (field !== "filters" && field !== "sortDescriptor") {
            ctx.addIssue({
              code: "custom",
              path: [field],
              params: { error: CustomErrorCode.invalidFilterField, validValues: "filters, sortDescriptor" },
            });
          }
        }
        if (input.filters) {
          const parsed = ActivityFiltersSchema.safeParse(input.filters);
          if (!parsed.success)
            for (const issue of parsed.error.issues) ctx.addIssue({ ...issue, path: ["filters", ...issue.path] });
        }
      }
      await this.queryPrecheck.invoke(
        surfaceKey === SURFACE.entityTimeline ? { ...config, customColumns: [] } : config,
        DATA_VIEW_SURFACES[surfaceKey].entityType,
        {
          filters: input.filters,
          sortDescriptor: input.sortDescriptor ?? undefined,
        },
        ctx,
      );
      if (input.searchTerm && !config.supportsSearch) {
        ctx.addIssue({
          code: "custom",
          path: ["searchTerm"],
          params: {
            error: CustomErrorCode.invalidFilterField,
            validValues: "",
          },
        });
      }
      if (input.viewMode && !config.viewModes.includes(input.viewMode)) {
        ctx.addIssue({
          code: "custom",
          path: ["viewMode"],
          params: {
            error: CustomErrorCode.invalidFilterValue,
            value: input.viewMode,
          },
        });
      }
      const resolved = input.grouping ? resolveGrouping(input.grouping, config.groupableFields) : undefined;
      if (
        input.grouping &&
        (!resolved || (input.grouping.bucket !== undefined && input.grouping.bucket !== resolved.grouping.bucket))
      ) {
        ctx.addIssue({
          code: "custom",
          path: ["grouping"],
          params: {
            error: CustomErrorCode.invalidFilterField,
            validValues: config.groupableFields.map(({ field }) => field).join(", "),
          },
        });
      }
    });
  }

  private link(path: string | null, viewKey: string): string | null {
    return path && `${path}?view=${encodeURIComponent(viewKey)}`;
  }
}
