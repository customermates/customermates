import type { RecordRepo } from "@/features/records/record.repo";
import type { QueryRecordsInteractor } from "@/features/records/query-records.interactor";
import type { CalculatedValue, RecordDto } from "@/features/records/record-model.schema";
import type { Validated } from "@/core/validation/validation.utils";
import type {
  MapWidgetData,
  MapWidgetPoint,
  MapWidgetQuery,
  RecordMapWidgetDto,
  StoredRecordMapWidget,
} from "./record-map-widget.schema";

import { runInTransaction } from "@/core/decorators/transaction-runner";
import { fail } from "@/core/validation/interactor-failure-server";
import { CustomErrorCode } from "@/core/validation/validation.types";
import { recordDisplayField } from "@/features/records/record-display-field.schema";
import { MAP_WIDGET_POINT_LIMIT } from "./record-map-widget.schema";
import { mapWidgetQueryIssue } from "./record-widget-query-validation";

type MapRead = { data: MapWidgetData; fields: RecordMapWidgetDto["fields"] };

const MAP_WIDGET_PAGE_SIZE = 500;
const MAP_WIDGET_PAGE_LIMIT = 10;
const MISSING: CalculatedValue = { state: "missing" };

export class RecordMapWidgetReader {
  constructor(
    private records: RecordRepo,
    private queries: QueryRecordsInteractor,
  ) {}

  read(row: StoredRecordMapWidget): Promise<RecordMapWidgetDto> {
    return runInTransaction(
      async () => {
        const result = await this.load(row.mapQuery);
        return result.ok
          ? { ...row, status: "ready" as const, data: result.data.data, fields: result.data.fields }
          : { ...row, status: "unavailable" as const, data: null, fields: [] };
      },
      { readOnly: true, timeout: 30000 },
    );
  }

  preview(query: MapWidgetQuery): Validated<MapRead> {
    return runInTransaction(() => this.load(query), { readOnly: true, timeout: 30000 });
  }

  private async load(query: MapWidgetQuery): Validated<MapRead> {
    const model = await this.records.getModel();
    const issue = mapWidgetQueryIssue(query, model);
    if (issue) return fail(issue.code, issue.path);
    const type = model.types.find((candidate) => candidate.id === query.source.typeId);
    if (!type) return fail(CustomErrorCode.recordTypeNotFound, ["mapQuery", "source", "typeId"]);
    const optional = [query.colorFieldId, query.sizeFieldId, query.detailFieldId];
    const fields = [...new Set([type.primaryFieldId, query.addressFieldId, ...optional])].filter((id): id is string =>
      Boolean(id),
    );
    const counted = await this.queries.invoke({
      ...query.source,
      fields: [query.addressFieldId],
      sort: [],
      page: 1,
      pageSize: 1,
    });
    if (!counted.ok) return counted;
    const result = (record: RecordDto, fieldId: string | null) =>
      (fieldId && record.fields.find((field) => field.fieldId === fieldId)?.result) || MISSING;
    const points: MapWidgetPoint[] = [];
    let addressed = 0;
    let scanned = 0;
    let unlocated = 0;
    let truncated = false;
    for (let page = 1; page <= MAP_WIDGET_PAGE_LIMIT && !truncated; page += 1) {
      const located = await this.queries.invoke({
        ...query.source,
        filters: [...query.source.filters, { fieldId: query.addressFieldId, operator: "notEmpty", value: null }],
        fields,
        sort: [{ fieldId: "system:createdAt", direction: "asc" }],
        page,
        pageSize: MAP_WIDGET_PAGE_SIZE,
      });
      if (!located.ok) return located;
      addressed = located.data.total;
      for (const record of located.data.records) {
        const address = result(record, query.addressFieldId);
        if (address.state !== "value" || address.value.kind !== "address" || !address.value.value.location) {
          unlocated += 1;
          continue;
        }
        if (points.length === MAP_WIDGET_POINT_LIMIT) {
          truncated = true;
          break;
        }
        const color = result(record, query.colorFieldId);
        const { location, formatted } = address.value.value;
        points.push({
          record: record.ref,
          title: result(record, type.primaryFieldId),
          lat: location.lat,
          lon: location.lon,
          precision: location.precision,
          address: formatted,
          color: color.state === "value" && color.value.kind === "select" ? color.value.value : null,
          size: query.sizeFieldId ? result(record, query.sizeFieldId) : null,
          detail: query.detailFieldId ? result(record, query.detailFieldId) : null,
        });
      }
      scanned += located.data.records.length;
      if (scanned >= addressed || located.data.records.length < MAP_WIDGET_PAGE_SIZE) break;
      if (page === MAP_WIDGET_PAGE_LIMIT) truncated = true;
    }
    const referenced = model.fields.filter((field) => fields.includes(field.id));
    return {
      ok: true as const,
      data: {
        fields: referenced.map(recordDisplayField),
        data: {
          schemaRevision: model.revision,
          points,
          total: counted.data.total,
          withoutLocation: Math.max(0, counted.data.total - addressed) + unlocated,
          truncated,
        },
      },
    };
  }
}
