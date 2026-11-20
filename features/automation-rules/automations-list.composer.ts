import type { SortableField, SearchableField } from "@/core/base/base-query-builder";
import type { Filter, FilterableField, GetQueryParams, SortDescriptor } from "@/core/base/base-get.schema";
import type { PermissionService } from "@/core/base/permission.service";
import type { GetRoutinesRepo } from "@/ee/routines/get-routines.repo";
import type { RoutineDto } from "@/ee/routines/routine.schema";
import type { AutomationRuleRepo } from "./automation-rule.repo";
import type { AutomationRuleDto } from "./automation-rule.schema";
import type { AutomationListItemDto, AutomationListNotShown, AutomationRunsOn } from "./automations-list.schema";

import { Resource, type RoutineRunStatus } from "@/generated/prisma";
import { BaseGetRepo } from "@/core/base/base-get.repo";
import { compareSortValues, defaultValidateFilters, FilterOperatorKey } from "@/core/base/base-query-builder";
import { FilterFieldKey } from "@/core/types/filter-field-key";
import { FILTER_FIELD_DEFAULT_OPERATORS } from "@/core/types/filter-field-operators";
import { resolveUserFormattingTag, resolveUserLocale } from "@/i18n/user-locale";

import { toAutomationRuleDto } from "./automation-rule-dto";
import {
  AUTOMATION_LIST_RULE_CAP,
  AUTOMATION_LIST_ROUTINE_CAP,
  AUTOMATION_LIST_WINDOW_DAYS,
} from "./automations-list.schema";

const DAY_MS = 24 * 60 * 60 * 1000;

const SORT_VALUES: Record<string, (item: AutomationListItemDto) => unknown> = {
  name: (item) => item.name,
  kind: (item) => item.kind,
  lastRunAt: (item) => item.lastRunAt,
  runs30d: (item) => item.runs30d,
  createdAt: (item) => item.createdAt,
  updatedAt: (item) => item.updatedAt,
};

const FILTER_VALUES: Record<string, (item: AutomationListItemDto) => string | null> = {
  [FilterFieldKey.automationKind]: (item) => item.kind,
  [FilterFieldKey.automationStatus]: (item) => (item.enabled ? "active" : "paused"),
  [FilterFieldKey.automationRunsOn]: (item) => item.runsOn,
  [FilterFieldKey.ownerUserId]: (item) => item.ownerUserId,
};

function ruleRunsOn(rule: AutomationRuleDto): AutomationRunsOn {
  const agent = rule.effects.find((effect) => effect.kind === "agent");
  return agent ? agent.runtime : "free";
}

function ruleRunStatus(status: AutomationRuleDto["lastRunStatus"]): RoutineRunStatus | null {
  if (!status) return null;
  return status === "applied" ? "succeeded" : status;
}

function ruleItem(rule: AutomationRuleDto, runs30d: number): AutomationListItemDto {
  return {
    id: rule.id,
    kind: "rule",
    name: rule.name,
    enabled: rule.enabled,
    disabledReason: rule.disabledReason,
    runsOn: ruleRunsOn(rule),
    lastRunAt: rule.lastRunAt ? new Date(rule.lastRunAt) : null,
    lastRunStatus: ruleRunStatus(rule.lastRunStatus),
    runs30d,
    ownerUserId: rule.ownerUserId,
    owner: rule.owner,
    createdAt: new Date(rule.createdAt),
    updatedAt: new Date(rule.updatedAt),
    rule,
    routine: null,
  };
}

function routineItem(routine: RoutineDto, runs30d: number): AutomationListItemDto {
  return {
    id: routine.id,
    kind: "routine",
    name: routine.name,
    enabled: routine.enabled,
    disabledReason: routine.disabledReason,
    runsOn: "mate",
    lastRunAt: routine.lastRunAt,
    lastRunStatus: routine.lastRunStatus,
    runs30d,
    ownerUserId: routine.ownerUserId,
    owner: routine.owner,
    createdAt: routine.createdAt,
    updatedAt: routine.updatedAt,
    rule: null,
    routine,
  };
}

function matchesFilter(filter: Filter, item: AutomationListItemDto): boolean {
  const read = FILTER_VALUES[filter.field];
  if (!read) return true;
  const actual = read(item);
  switch (filter.operator) {
    case FilterOperatorKey.equals:
      return actual === filter.value;
    case FilterOperatorKey.notEquals:
      return actual !== filter.value;
    case FilterOperatorKey.in:
      return actual !== null && filter.value.includes(actual);
    case FilterOperatorKey.notIn:
      return actual === null || !filter.value.includes(actual);
    default:
      return true;
  }
}

export class AutomationsListComposer extends BaseGetRepo<AutomationListItemDto> {
  constructor(
    private readonly rules: Pick<AutomationRuleRepo, "findRules" | "countRunsSince">,
    private readonly routines: Pick<GetRoutinesRepo, "getItems" | "getCount" | "countRunsSince"> | null,
    private readonly permissions: PermissionService,
    private readonly clock: () => Date = () => new Date(),
  ) {
    super();
  }

  private async load(): Promise<AutomationListItemDto[]> {
    const since = new Date(this.clock().getTime() - AUTOMATION_LIST_WINDOW_DAYS * DAY_MS);
    const ownRules = this.permissions.readScope(Resource.routines) === "own";
    const [rulePage, routines] = await Promise.all([
      this.rules.findRules({
        ownerUserId: ownRules ? this.permissions.userId : undefined,
        page: 1,
        pageSize: AUTOMATION_LIST_RULE_CAP,
      }),
      this.routines ? this.routines.getItems({}) : Promise.resolve([] as RoutineDto[]),
    ]);
    const ruleDtos = rulePage.items.map(toAutomationRuleDto);
    const routineRows = routines.slice(0, AUTOMATION_LIST_ROUTINE_CAP);
    const [ruleRuns, routineRuns] = await Promise.all([
      this.rules.countRunsSince(
        ruleDtos.map((rule) => rule.id),
        since,
      ),
      this.routines
        ? this.routines.countRunsSince(
            routineRows.map((routine) => routine.id),
            since,
          )
        : Promise.resolve(new Map<string, number>()),
    ]);
    return [
      ...ruleDtos.map((rule) => ruleItem(rule, ruleRuns.get(rule.id) ?? 0)),
      ...routineRows.map((routine) => routineItem(routine, routineRuns.get(routine.id) ?? 0)),
    ];
  }

  async notShown(): Promise<AutomationListNotShown> {
    const ownRules = this.permissions.readScope(Resource.routines) === "own";
    const [rulePage, routines] = await Promise.all([
      this.rules.findRules({ ownerUserId: ownRules ? this.permissions.userId : undefined, page: 1, pageSize: 1 }),
      this.routines ? this.routines.getCount({}) : Promise.resolve(0),
    ]);
    return {
      rules: Math.max(0, rulePage.total - AUTOMATION_LIST_RULE_CAP),
      routines: Math.max(0, routines - AUTOMATION_LIST_ROUTINE_CAP),
    };
  }

  private narrow(items: AutomationListItemDto[], params: GetQueryParams): AutomationListItemDto[] {
    const filters = params.filters ?? [];
    const term = params.searchTerm?.trim().toLowerCase();
    const matching = items.filter(
      (item) =>
        filters.every((filter) => matchesFilter(filter, item)) && (!term || item.name.toLowerCase().includes(term)),
    );
    const sort = params.sortDescriptor;
    const read = sort ? SORT_VALUES[sort.field] : undefined;
    const direction = sort?.direction ?? "desc";
    const column = read ?? SORT_VALUES.createdAt;
    const collator = this.collator();
    return [...matching].sort(
      (left, right) =>
        compareSortValues([column(left)], [column(right)], direction, collator) ||
        (left.id < right.id ? -1 : left.id > right.id ? 1 : 0),
    );
  }

  override collator(): Pick<Intl.Collator, "compare"> {
    const { user } = this.permissions;
    return new Intl.Collator(resolveUserFormattingTag(user, resolveUserLocale(user)));
  }

  async getItems(params: GetQueryParams): Promise<AutomationListItemDto[]> {
    const narrowed = this.narrow(await this.load(), params);
    const pagination = params.pagination;
    if (!pagination) return narrowed;
    const start = (pagination.page - 1) * pagination.pageSize;
    return narrowed.slice(start, start + pagination.pageSize);
  }

  async getCount(params: GetQueryParams): Promise<number> {
    return this.narrow(await this.load(), params).length;
  }

  getSortableFields() {
    return [
      { field: "name", resolvedFields: ["name"], collate: true },
      { field: "kind", resolvedFields: ["kind"] },
      { field: "lastRunAt", resolvedFields: ["lastRunAt"], nullable: true },
      { field: "runs30d", resolvedFields: ["runs30d"] },
      { field: "createdAt", resolvedFields: ["createdAt"] },
      { field: "updatedAt", resolvedFields: ["updatedAt"] },
    ];
  }

  getSearchableFields(): SearchableField[] {
    return [{ field: "name" }];
  }

  getFilterableFields(): Promise<FilterableField[]> {
    return Promise.resolve(
      [
        FilterFieldKey.automationKind,
        FilterFieldKey.automationStatus,
        FilterFieldKey.automationRunsOn,
        FilterFieldKey.ownerUserId,
      ].map((field) => ({ field, operators: FILTER_FIELD_DEFAULT_OPERATORS[field] })),
    );
  }

  validateFilters(args: { filters: Filter[] | undefined; filterableFields: FilterableField[] }): Filter[] {
    return defaultValidateFilters(args);
  }

  validateSortDescriptor(args: {
    sortDescriptor: SortDescriptor | undefined;
    sortableFields: SortableField[];
  }): SortDescriptor | undefined {
    const { sortDescriptor, sortableFields } = args;
    if (!sortDescriptor || typeof sortDescriptor !== "object") return undefined;
    if (!["asc", "desc"].includes(sortDescriptor.direction)) return undefined;
    return sortableFields.some((field) => field.field === sortDescriptor.field) ? sortDescriptor : undefined;
  }
}
