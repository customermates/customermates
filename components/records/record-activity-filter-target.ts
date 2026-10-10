import type { Filter, FilterableField } from "@/core/base/base-get.schema";
import type { ColumnPresentation } from "@/core/data-view/column-presentation.schema";
import type { FilterTarget } from "@/components/data-view/filter-palette/filter-target";
import type { RecordActivityFilter, RecordActivityQuery } from "@/ee/messaging/activities/record-activities.schema";
import { RecordActivityFilterSchema } from "@/ee/messaging/activities/record-activities.schema";
import { FilterOperatorKey as Op } from "@/core/base/base-query-builder";

type Choice = { id: string; label: string };
type Options = {
  read: () => RecordActivityQuery;
  write: (query: RecordActivityQuery) => void;
  isDisabled: () => boolean;
  identity: () => unknown;
  types: () => Choice[];
  sources: Choice[];
  providers: Choice[];
  labels: {
    source: string;
    provider: string;
    account: string;
    thread: string;
    after: string;
    before: string;
    saved: string;
    unavailable: string;
  };
};
const SOURCE = "activity:source";
const AFTER = "activity:after";
const BEFORE = "activity:before";
const RECORD_PREFIX = "activity:record:";
const fieldFor = (filter: RecordActivityFilter) =>
  filter.kind === "record"
    ? `${RECORD_PREFIX}${filter.typeId}`
    : { source: SOURCE, provider: "provider", account: "connectedAccountId", thread: "timelineThreadId" }[filter.kind];

export function createRecordActivityFilterTarget(options: Options): FilterTarget {
  const { read, write, labels } = options;
  const recordTypes = () => {
    const types = new Map(options.types().map((type) => [type.id, type]));
    for (const filter of read().filters ?? []) {
      if (filter.kind === "record" && !types.has(filter.typeId))
        types.set(filter.typeId, { id: filter.typeId, label: labels.unavailable });
    }
    return [...types.values()];
  };
  const choiceField = (field: string, label: string, choices?: Choice[]): FilterableField => ({
    field,
    label,
    operators: [Op.in, Op.notIn],
    ...(choices ? { options: choices.map(({ id, label }) => ({ value: id, label })) } : {}),
  });
  const fields = (): FilterableField[] => [
    choiceField(SOURCE, labels.source, options.sources),
    choiceField("provider", labels.provider, options.providers),
    choiceField("connectedAccountId", labels.account),
    choiceField("timelineThreadId", labels.thread),
    ...recordTypes().map((type) => ({
      field: `${RECORD_PREFIX}${type.id}`,
      label: type.label,
      operators: [Op.in, Op.notIn, Op.hasSome, Op.hasNone],
    })),
    { field: AFTER, label: labels.after, operators: [Op.gte] },
    { field: BEFORE, label: labels.before, operators: [Op.lte] },
  ];
  const columns = (): ColumnPresentation[] => [
    { id: SOURCE, label: labels.source, type: "singleSelect", options: { options: [] } },
    ...recordTypes().map(
      (type): ColumnPresentation => ({
        id: `${RECORD_PREFIX}${type.id}`,
        label: type.label,
        type: "recordReference",
        typeId: type.id,
      }),
    ),
    { id: AFTER, label: labels.after, type: "dateTime" },
    { id: BEFORE, label: labels.before, type: "dateTime" },
  ];
  const toPalette = (filter: RecordActivityFilter): Filter => {
    const field = fieldFor(filter);
    if (filter.operator === "hasSome" || filter.operator === "hasNone")
      return { field, operator: filter.operator === "hasSome" ? Op.hasSome : Op.hasNone };
    return {
      field,
      operator: filter.operator === "in" ? Op.in : Op.notIn,
      value: filter.kind === "record" ? filter.recordIds : filter.values,
    };
  };
  const fromPalette = (filter: Filter): RecordActivityFilter | undefined => {
    const record = filter.field.startsWith(RECORD_PREFIX);
    const kind = record
      ? "record"
      : (
          {
            [SOURCE]: "source",
            provider: "provider",
            connectedAccountId: "account",
            timelineThreadId: "thread",
          } as Record<string, string>
        )[filter.field];
    if (!kind) return;
    const value = "value" in filter && Array.isArray(filter.value) ? filter.value : [];
    const parsed = RecordActivityFilterSchema.safeParse({
      kind,
      operator: filter.operator,
      ...(record ? { typeId: filter.field.slice(RECORD_PREFIX.length), recordIds: value } : { values: value }),
    });
    return parsed.success ? parsed.data : undefined;
  };
  const savedTarget: FilterTarget = {
    uniqueFields: ["provider", "timelineThreadId"],
    get isDisabled() {
      return options.isDisabled();
    },
    get filterableFields() {
      return fields()
        .filter(
          ({ field }) =>
            (field === "provider" && read().providers !== undefined) ||
            (field === "timelineThreadId" && read().threadIds !== undefined),
        )
        .map((field) => ({ ...field, operators: [Op.in] }));
    },
    get filters() {
      const query = read();
      return [
        ...(query.providers !== undefined
          ? [{ field: "provider", operator: Op.in, value: query.providers } as const]
          : []),
        ...(query.threadIds !== undefined
          ? [{ field: "timelineThreadId", operator: Op.in, value: query.threadIds } as const]
          : []),
      ];
    },
    setQueryOptions({ filters }) {
      if (options.isDisabled()) return;
      const providers = filters.find((filter) => filter.field === "provider");
      const threads = filters.find((filter) => filter.field === "timelineThreadId");
      const query = read();
      const parsed = RecordActivityFilterSchema.safeParse({
        kind: "provider",
        operator: "in",
        values: providers && "value" in providers ? providers.value : [],
      });
      write({
        ...query,
        providers:
          parsed.success && parsed.data.kind === "provider"
            ? parsed.data.values
            : providers
              ? query.providers
              : undefined,
        threadIds: threads && "value" in threads && Array.isArray(threads.value) ? threads.value : undefined,
      });
    },
    removeFilterAt(index) {
      this.setQueryOptions({ filters: this.filters?.filter((_, i) => i !== index) ?? [] });
    },
  };
  const target: FilterTarget = {
    discardPendingOnDispose: true,
    uniqueFields: [AFTER, BEFORE],
    canAddField: (field) => field === AFTER || field === BEFORE || (read().filters?.length ?? 0) < 20,
    get identity() {
      return options.identity();
    },
    get isDisabled() {
      return options.isDisabled();
    },
    get maxFilters() {
      return 20 + Number(read().after !== undefined) + Number(read().before !== undefined);
    },
    get filterableFields() {
      return fields();
    },
    get filterColumns() {
      return columns();
    },
    get groups() {
      return read().providers !== undefined || read().threadIds !== undefined
        ? [
            {
              id: "saved-scope",
              label: labels.saved,
              target: savedTarget,
              mode: "",
              modes: [],
              setMode: () => undefined,
              remove: () => savedTarget.setQueryOptions({ filters: [] }),
            },
          ]
        : [];
    },
    get filters() {
      const query = read();
      return [
        ...(query.filters ?? []).map(toPalette),
        ...(query.after !== undefined ? [{ field: AFTER, operator: Op.gte, value: query.after } as const] : []),
        ...(query.before !== undefined ? [{ field: BEFORE, operator: Op.lte, value: query.before } as const] : []),
      ];
    },
    setQueryOptions({ filters, forceRefresh }) {
      if (options.isDisabled()) return;
      const query = read();
      const nextFilters = filters.flatMap((filter) => {
        const parsed = fromPalette(filter);
        return parsed ? [parsed] : [];
      });
      if (nextFilters.length > 20) return;
      const after = filters.find((filter) => filter.field === AFTER);
      const before = filters.find((filter) => filter.field === BEFORE);
      write({
        ...query,
        filters: nextFilters,
        after: after && "value" in after && typeof after.value === "string" ? after.value : undefined,
        before: before && "value" in before && typeof before.value === "string" ? before.value : undefined,
        ...(forceRefresh ? { providers: undefined, threadIds: undefined } : {}),
      });
    },
    removeFilterAt(index) {
      this.setQueryOptions({ filters: this.filters?.filter((_, i) => i !== index) ?? [] });
    },
  };
  return target;
}
