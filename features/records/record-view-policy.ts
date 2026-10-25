import type { DataViewState } from "@/core/data-view/data-view-state.schema";
import type { DataViewPolicy } from "@/features/data-view/data-view-policy";
import type { RecordRepo } from "./record.repo";
import type { RecordAccessPolicy } from "./record-access";

import { CustomErrorCode } from "@/core/validation/validation.types";
import { RecordSurfaceKeySchema } from "@/core/data-view/data-view-identity.schema";
import { isActivitySurface } from "@/core/data-view/data-view-keys";
import { activityViewStateValid, activityViewFilters } from "@/ee/messaging/activities/record-activity-view";
import { liveRecordFilters, recordViewStateIsValid } from "./record-view-state";
import { recordSurfaceKey } from "@/core/data-view/data-view-keys";
import { recordColumns } from "./record-columns";
import { recordFilterPaths, resolveRecordPath } from "./record-relationship-path";
import { recordGroupableFields, resolveRecordGrouping } from "./record-grouping";
import type { Grouping } from "@/core/base/grouping/grouping.schema";
import type { Filter } from "@/core/base/base-get.schema";
import { presentationFiltersAreValid, recordFilterableFields } from "./record-presentation";
import type { CalendarViewConfig } from "@/core/data-view/calendar-view-config.schema";
import {
  isCalendarColorField,
  isCalendarDateField,
  isCalendarEndField,
  isCalendarRangeField,
  resolveCalendarFields,
} from "@/features/record-calendar/record-calendar-query";

export class RecordViewPolicy implements DataViewPolicy {
  constructor(
    private records: RecordRepo,
    private access: RecordAccessPolicy,
  ) {}
  async list() {
    const [model, policy] = await Promise.all([this.records.getModel(), this.access.load()]);
    return model.types
      .filter((type) => !type.archived && !type.embedded && policy.canReadType(type.id))
      .map((type) => ({ surfaceKey: recordSurfaceKey(type.id), label: type.pluralLabel, path: `/records/${type.id}` }));
  }
  async describe(surfaceKey: string) {
    const typeId = surfaceKey.slice(8);
    const [model, policy] = await Promise.all([this.records.getModel(), this.access.load()]);
    const type = model.types.find((type) => type.id === typeId && !type.archived);
    if (!type || !policy.actor || !policy.canReadType(typeId)) return null;
    const relationships = model.relationships.filter(
      (relation) => policy.canReadType(relation.sourceTypeId) && policy.canReadType(relation.targetTypeId),
    );
    return {
      type: {
        ...type,
        relationshipPaths: type.relationshipPaths?.filter(
          (path) => !path.archived && resolveRecordPath(type.id, path.path, { relationships }),
        ),
      },
      fields: model.fields.filter((field) => field.typeId === typeId && !field.archived),
      relationships,
      columns: recordColumns(typeId, { ...model, relationships }),
    };
  }
  async unsupportedGrouping(surfaceKey: string, grouping: Grouping): Promise<string[] | null> {
    if (!RecordSurfaceKeySchema.safeParse(surfaceKey).success) return null;
    const typeId = surfaceKey.slice(8);
    const model = await this.records.getModel();
    if (!model.types.some((type) => type.id === typeId && !type.archived)) return null;
    if (resolveRecordGrouping(typeId, grouping, model)) return null;
    return [...new Set(recordGroupableFields(typeId, model).map((field) => field.grouping.field))];
  }
  async invalidFilter(
    surfaceKey: string,
    filters: Filter[],
  ): Promise<{ index: number; code: CustomErrorCode; values: Record<string, string> } | null> {
    if (!RecordSurfaceKeySchema.safeParse(surfaceKey).success) return null;
    const typeId = surfaceKey.slice(8);
    const model = await this.records.getModel();
    const type = model.types.find((candidate) => candidate.id === typeId && !candidate.archived);
    if (!type) return null;
    const fields = model.fields.filter((field) => field.typeId === typeId && !field.archived);
    const paths = recordFilterPaths(typeId, model);
    const definitions = recordFilterableFields(fields, model.relationships, typeId, paths);
    for (const [index, filter] of filters.entries()) {
      if (presentationFiltersAreValid([filter], fields, model.relationships, typeId, paths)) continue;
      const definition = definitions.find((candidate) => candidate.field === filter.field);
      if (!definition) {
        return {
          index,
          code: CustomErrorCode.invalidFilterField,
          values: { validValues: definitions.map((candidate) => candidate.field).join(", ") },
        };
      }
      const label = fields.find((field) => field.id === filter.field)?.label;
      return {
        index,
        code: CustomErrorCode.invalidFilterOperator,
        values: {
          operator: filter.operator,
          field: label ? `${label} (${filter.field})` : filter.field,
          validValues: definition.operators.join(", "),
        },
      };
    }
    return null;
  }
  async invalidCalendar(
    surfaceKey: string,
    calendar: CalendarViewConfig,
  ): Promise<{ key: "dateFieldId" | "endDateFieldId" | "colorFieldId"; validValues: string[] } | null> {
    if (!RecordSurfaceKeySchema.safeParse(surfaceKey).success) return null;
    const typeId = surfaceKey.slice(8);
    const model = await this.records.getModel();
    const fields = model.fields.filter((field) => field.typeId === typeId && !field.archived);
    if (resolveCalendarFields(typeId, calendar, fields)) return null;
    const start = fields.find((field) => field.id === calendar.dateFieldId && isCalendarDateField(field));
    if (!start) return { key: "dateFieldId", validValues: fields.filter(isCalendarDateField).map((field) => field.id) };
    const color = fields.find((field) => field.id === calendar.colorFieldId);
    if (calendar.colorFieldId && !(color && isCalendarColorField(color)))
      return { key: "colorFieldId", validValues: fields.filter(isCalendarColorField).map((field) => field.id) };
    return {
      key: "endDateFieldId",
      validValues: isCalendarRangeField(start)
        ? []
        : fields.filter((field) => field.id !== start.id && isCalendarEndField(field, start)).map((field) => field.id),
    };
  }
  async liveState(surfaceKey: string, state: DataViewState): Promise<DataViewState> {
    if (!state.filters || !RecordSurfaceKeySchema.safeParse(surfaceKey).success) return state;
    const model = await this.records.getModel();
    return { ...state, filters: liveRecordFilters(surfaceKey.slice(8), state.filters, model) };
  }
  async validate(surfaceKey: string, state?: DataViewState): Promise<CustomErrorCode | null> {
    if (isActivitySurface(surfaceKey)) {
      if (!state) return null;
      if (!activityViewStateValid(state)) return CustomErrorCode.recordValueInvalid;
      for (const filter of activityViewFilters(state.filters ?? [])) {
        if (filter.kind === "record") {
          const invalid = await this.validate(`records:${filter.typeId}`);
          if (invalid) return invalid;
        }
      }
      return null;
    }
    if (!RecordSurfaceKeySchema.safeParse(surfaceKey).success) return CustomErrorCode.recordTypeNotFound;
    const typeId = surfaceKey.slice(8);
    const [model, policy] = await Promise.all([this.records.getModel(), this.access.load()]);
    if (!model.types.some((type) => type.id === typeId && !type.archived)) return CustomErrorCode.recordTypeNotFound;
    if (!policy.actor || !policy.canReadType(typeId)) return CustomErrorCode.permissionDenied;
    if (!state) return null;
    return recordViewStateIsValid(typeId, state, model) ? null : CustomErrorCode.recordValueInvalid;
  }
}
