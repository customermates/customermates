"use server";

import type { RecordMeasure } from "@/features/records/record-measure.schema";
import type { RecordActivityWidgetInput } from "@/features/widget/record-activity-widget.schema";
import type { RecordCalendarWidgetInput } from "@/features/widget/record-calendar-widget.schema";
import type { RecordMapWidgetInput } from "@/features/widget/record-map-widget.schema";
import type { CalendarWidgetQuery, CalendarWidgetWindow } from "@/features/widget/record-calendar-widget.schema";
import type { MapWidgetQuery } from "@/features/widget/record-map-widget.schema";

import type { UpdateUserDetailsData } from "@/features/user/upsert/update-user-details.interactor";
import type { DeleteWidgetData } from "@/features/widget/delete-widget.interactor";
import type { GetWidgetByIdData } from "@/features/widget/get-widget-by-id.interactor";
import type { RecordWidgetInput } from "@/features/widget/record-widget.schema";
import type { UpdateWidgetLayoutsData } from "@/features/widget/update-widget-layouts.interactor";

import {
  getDeleteWidgetInteractor,
  getDiscoverRecordTypesInteractor,
  getGetCompanyWidgetsInteractor,
  getGetWidgetByIdInteractor,
  getGetWidgetsInteractor,
  getPreviewRecordWidgetInteractor,
  getUpdateUserDetailsInteractor,
  getUpdateWidgetLayoutsInteractor,
  getUpsertRecordActivityWidgetInteractor,
  getUpsertRecordWidgetInteractor,
  getUpsertRecordCalendarWidgetInteractor,
  getUpsertRecordMapWidgetInteractor,
  getPreviewRecordCalendarWidgetInteractor,
  getPreviewRecordMapWidgetInteractor,
  getGetRecordWidgetInteractor,
} from "@/core/di";
import { serializeResult, serializeTypedData, serializeTypedResult } from "@/core/utils/action-result";

export async function deleteWidgetAction(data: DeleteWidgetData) {
  return serializeResult(getDeleteWidgetInteractor().invoke(data));
}

export async function getCompanyWidgetsAction() {
  return serializeResult(getGetCompanyWidgetsInteractor().invoke());
}

export async function getWidgetByIdAction(data: GetWidgetByIdData) {
  return serializeTypedResult(getGetWidgetByIdInteractor().invoke(data));
}

export async function updateWidgetLayoutsAction(data: UpdateWidgetLayoutsData) {
  return serializeResult(getUpdateWidgetLayoutsInteractor().invoke(data));
}

export async function refreshWidgetsAction(viewId?: string) {
  return serializeTypedResult(getGetWidgetsInteractor().invoke({ viewId }));
}

export async function updatePreferencesAction(data: UpdateUserDetailsData) {
  return serializeResult(getUpdateUserDetailsInteractor().invoke(data));
}

export async function upsertRecordWidgetAction(input: RecordWidgetInput) {
  return serializeResult(getUpsertRecordWidgetInteractor().invoke(input));
}

export async function discoverWidgetRecordTypesAction(params: { searchTerm?: string }) {
  return serializeTypedData(
    getDiscoverRecordTypesInteractor().invoke({
      search: params.searchTerm,
      includeEmbedded: true,
      page: 1,
      pageSize: 100,
    }),
    (data) => ({
      items: data.types.filter((type) =>
        type.permittedActions.some((action) => action === "readOwn" || action === "readAll"),
      ),
      total: data.total,
    }),
  );
}

export async function previewRecordWidgetAction(measure: RecordMeasure) {
  return serializeResult(getPreviewRecordWidgetInteractor().invoke(measure));
}

export async function upsertRecordActivityWidgetAction(input: RecordActivityWidgetInput) {
  return serializeResult(getUpsertRecordActivityWidgetInteractor().invoke(input));
}

export async function upsertRecordCalendarWidgetAction(input: RecordCalendarWidgetInput) {
  return serializeResult(getUpsertRecordCalendarWidgetInteractor().invoke(input));
}

export async function upsertRecordMapWidgetAction(input: RecordMapWidgetInput) {
  return serializeResult(getUpsertRecordMapWidgetInteractor().invoke(input));
}

export async function previewCalendarWidgetAction(calendarQuery: CalendarWidgetQuery, window?: CalendarWidgetWindow) {
  return serializeResult(getPreviewRecordCalendarWidgetInteractor().invoke({ calendarQuery, window }));
}

export async function previewMapWidgetAction(mapQuery: MapWidgetQuery) {
  return serializeResult(getPreviewRecordMapWidgetInteractor().invoke({ mapQuery }));
}

export async function readCalendarWidgetWindowAction(id: string, window: CalendarWidgetWindow) {
  return serializeResult(getGetRecordWidgetInteractor().invoke({ id, window }));
}
