import { FilterOperatorKey } from "@/core/base/base-query-builder";

import type { Filter, SortDescriptor } from "@/core/base/base-get.schema";
import type { BaseDataViewStore, HasId } from "@/core/base/base-data-view.store";
import type { RootStore } from "@/core/stores/root.store";
import type { ConfigureViewData } from "@/features/agent-chat/ui-operations";

export type AgentDataViewStore = BaseDataViewStore<HasId>;

export function resolveDataViewStore(root: RootStore, view: string): AgentDataViewStore | null {
  switch (view) {
    case "contacts":
      return root.contactsStore as unknown as AgentDataViewStore;
    case "organizations":
      return root.organizationsStore as unknown as AgentDataViewStore;
    case "deals":
      return root.dealsStore as unknown as AgentDataViewStore;
    case "services":
      return root.servicesStore as unknown as AgentDataViewStore;
    case "tasks":
      return root.tasksStore as unknown as AgentDataViewStore;
    case "company-members":
      return root.usersStore as unknown as AgentDataViewStore;
    case "company-roles":
      return root.rolesStore as unknown as AgentDataViewStore;
    case "company-webhooks":
      return root.webhooksStore as unknown as AgentDataViewStore;
    case "company-webhook-deliveries":
      return root.webhookDeliveriesStore as unknown as AgentDataViewStore;
    case "company-audit-logs":
      return root.auditLogsStore as unknown as AgentDataViewStore;
    default:
      return null;
  }
}

type Resolution<T> = { ok: true; value: T } | { ok: false; message: string };

const normalize = (value: string) => value.trim().toLowerCase();

export function resolveGroupByColumn(store: AgentDataViewStore, label: string): Resolution<string> {
  const columns = store.singleSelectCustomColumns;
  if (columns.length === 0) {
    return {
      ok: false,
      message: "Kanban needs a single-select custom field to group by; this view has none. Offer to create one.",
    };
  }
  const match = columns.find((column) => normalize(column.label) === normalize(label)) ?? null;
  if (match) return { ok: true, value: match.id };
  const available = columns.map((column) => column.label).join(", ");
  return { ok: false, message: `No single-select field named "${label}". Available: ${available}.` };
}

export function resolveSortColumn(store: AgentDataViewStore, nameOrLabel: string): Resolution<string> {
  const wanted = normalize(nameOrLabel);
  const sortable = store.columnsDefinition.filter((column) => column.sortable);
  const byUid = sortable.find((column) => normalize(column.uid) === wanted);
  if (byUid) return { ok: true, value: byUid.uid };
  const byLabel = sortable.find((column) => column.label && normalize(column.label) === wanted);
  if (byLabel) return { ok: true, value: byLabel.uid };
  const customColumn = store.customColumns.find((column) => normalize(column.label) === wanted);
  if (customColumn && sortable.some((column) => column.uid === customColumn.id))
    return { ok: true, value: customColumn.id };
  const available = sortable.map((column) => column.label ?? column.uid).join(", ");
  return { ok: false, message: `"${nameOrLabel}" is not sortable here. Sortable: ${available}.` };
}

export function toSortDescriptor(field: string, direction: "asc" | "desc" | undefined): SortDescriptor {
  return { field, direction: direction ?? "asc" };
}

export function toFilters(
  store: AgentDataViewStore,
  flat: NonNullable<ConfigureViewData["filters"]>,
): Resolution<Filter[]> {
  const filters: Filter[] = [];
  for (const entry of flat) {
    const descriptor = store.filterableFields.find(
      (candidate) =>
        normalize(candidate.field) === normalize(entry.field) ||
        (candidate.label && normalize(candidate.label) === normalize(entry.field)),
    );
    if (!descriptor) {
      const available = store.filterableFields.map((candidate) => candidate.label ?? candidate.field).join(", ");
      return { ok: false, message: `"${entry.field}" is not filterable here. Filterable: ${available}.` };
    }
    if (!descriptor.operators.includes(entry.operator as (typeof descriptor.operators)[number])) {
      return {
        ok: false,
        message: `"${entry.field}" does not support "${entry.operator}". Supported: ${descriptor.operators.join(", ")}.`,
      };
    }
    if (entry.operator === "isNull" || entry.operator === "isNotNull")
      filters.push({ field: descriptor.field, operator: FilterOperatorKey[entry.operator] });
    else if (entry.operator === "in" || entry.operator === "notIn" || entry.operator === "between") {
      const values = entry.values ?? (entry.value !== undefined ? [entry.value] : []);
      if (values.length === 0)
        return { ok: false, message: `"${entry.field}" with "${entry.operator}" needs at least one value.` };
      if (entry.operator === "between" && values.length !== 2)
        return { ok: false, message: `"${entry.field}" with "between" needs exactly two values.` };
      filters.push({ field: descriptor.field, operator: FilterOperatorKey[entry.operator], value: values });
    } else if (entry.operator === "inLastDays") {
      const days = Number(entry.value);
      if (!Number.isInteger(days) || days < 1)
        return { ok: false, message: `"${entry.field}" with "inLastDays" needs a positive whole number of days.` };
      filters.push({ field: descriptor.field, operator: FilterOperatorKey.inLastDays, value: days });
    } else {
      if (entry.value === undefined)
        return { ok: false, message: `"${entry.field}" with "${entry.operator}" needs a value.` };
      filters.push({ field: descriptor.field, operator: FilterOperatorKey[entry.operator], value: entry.value });
    }
  }
  return { ok: true, value: filters };
}
