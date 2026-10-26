import type { RecordModel } from "@/features/records/record-model.schema";
import type { SavePlannerInput } from "@/features/planner/planner.schema";
import type { SetupPlan } from "./setup-plan.schema";
import type { SetupCompileIssue, SetupCompileResult, SetupResolver } from "./setup-references";

import { FilterOperatorKey } from "@/core/base/base-query-builder";
import { resolveCalendarFields } from "@/features/record-calendar/record-calendar-query";

type SetupCalendarSources = NonNullable<NonNullable<SavePlannerInput["config"]>["sources"]>;

export function compileSetupCalendar(
  plan: SetupPlan,
  resolver: SetupResolver,
  model: RecordModel,
): SetupCompileResult<SetupCalendarSources> {
  const issues: SetupCompileIssue[] = [];
  const sources: SetupCalendarSources = [];
  plan.calendar.sources.forEach((source, index) => {
    const path = `calendar.sources.${index}`;
    const before = issues.length;
    const missing = (code: string, at: string) => {
      issues.push({ code, path: `${path}.${at}` });
      return undefined;
    };
    const typeId = resolver.list(source.list) ?? missing("unknown_list", "list");
    const dateFieldId = resolver.field(source.dateField) ?? missing("unknown_field", "dateField");
    const endDateFieldId = source.endField
      ? (resolver.field(source.endField) ?? missing("unknown_field", "endField"))
      : null;
    const filters = source.filters.flatMap((filter, position) => {
      const at = `filters.${position}`;
      const field = resolver.field(filter.field) ?? missing("unknown_field", `${at}.field`);
      const value = filter.options.flatMap(
        (key, option) =>
          resolver.option(filter.field, key) ?? missing("unknown_option", `${at}.options.${option}`) ?? [],
      );
      if (!field) return [];
      const operator = filter.operator === "in" ? (FilterOperatorKey.in as const) : (FilterOperatorKey.notIn as const);
      return [{ field, operator, value }];
    });
    if (!typeId || !dateFieldId || issues.length > before) return;
    const calendar = { dateFieldId, ...(endDateFieldId ? { endDateFieldId } : {}) };
    const fields = model.fields.filter((field) => field.typeId === typeId && !field.archived);
    if (!resolveCalendarFields(typeId, calendar, fields)) return missing("invalid_calendar_field", "dateField");
    sources.push({ typeId, calendar, filters, enabled: true, color: source.color });
  });
  return issues.length ? { ok: false, issues } : { ok: true, data: sources };
}
