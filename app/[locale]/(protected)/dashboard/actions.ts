"use server";

import type { RecordActivityWidgetInput } from "@/features/widget/record-activity-widget.schema";
import type { RecordMeasure } from "@/features/records/record-measure.schema";

import type { RecordWidgetInput } from "@/features/widget/record-widget.schema";
import type { DeleteWidgetData } from "@/features/widget/delete-widget.interactor";
import type { GetWidgetByIdData } from "@/features/widget/get-widget-by-id.interactor";
import type { UpsertWidgetData } from "@/features/widget/upsert-widget.interactor";
import type { UpdateWidgetLayoutsData } from "@/features/widget/update-widget-layouts.interactor";
import type { UpdateUserDetailsData } from "@/features/user/upsert/update-user-details.interactor";

import {
  getUpsertRecordActivityWidgetInteractor,
  getDiscoverRecordTypesInteractor,
  getQueryRecordMeasureInteractor,
  getUpsertRecordWidgetInteractor,
  getGetRecordWidgetsInteractor,
  getGetRecordWidgetInteractor,
  getUpsertWidgetInteractor,
  getDeleteWidgetInteractor,
  getGetCompanyWidgetsInteractor,
  getGetWidgetByIdInteractor,
  getUpdateWidgetLayoutsInteractor,
  getGetWidgetsInteractor,
  getUpdateUserDetailsInteractor,
} from "@/core/di";
import { serializeResult } from "@/core/utils/action-result";

export async function upsertWidgetAction(data: UpsertWidgetData) {
  return serializeResult(getUpsertWidgetInteractor().invoke(data));
}

export async function deleteWidgetAction(data: DeleteWidgetData) {
  return serializeResult(getDeleteWidgetInteractor().invoke(data));
}

export async function getCompanyWidgetsAction() {
  return serializeResult(getGetCompanyWidgetsInteractor().invoke());
}

export async function getWidgetByIdAction(data: GetWidgetByIdData) {
  const result = await getGetWidgetByIdInteractor().invoke(data);
  return result.ok ? result.data : null;
}

export async function updateWidgetLayoutsAction(data: UpdateWidgetLayoutsData) {
  return serializeResult(getUpdateWidgetLayoutsInteractor().invoke(data));
}

export async function refreshWidgetsAction() {
  const result = await getGetWidgetsInteractor().invoke();
  return result.data;
}

export async function updateThemeAction(data: UpdateUserDetailsData) {
  return serializeResult(getUpdateUserDetailsInteractor().invoke(data));
}

export async function upsertRecordWidgetAction(input: RecordWidgetInput) {
  return serializeResult(getUpsertRecordWidgetInteractor().invoke(input));
}
export async function getRecordWidgetsAction() {
  return serializeResult(getGetRecordWidgetsInteractor().invoke());
}
export async function getRecordWidgetAction(id: string) {
  return serializeResult(getGetRecordWidgetInteractor().invoke({ id }));
}

export async function discoverWidgetRecordTypesAction(params: { searchTerm?: string }) {
  const result = await getDiscoverRecordTypesInteractor().invoke({
    search: params.searchTerm,
    includeEmbedded: true,
    page: 1,
    pageSize: 100,
  });
  if (!result.ok) return { items: [], total: 0 };
  return {
    items: result.data.types.filter((type) =>
      type.permittedActions.some((action) => action === "readOwn" || action === "readAll"),
    ),
    total: result.data.total,
  };
}
export async function previewRecordWidgetAction(measure: RecordMeasure) {
  return serializeResult(getQueryRecordMeasureInteractor().invoke(measure));
}

export async function upsertRecordActivityWidgetAction(input: RecordActivityWidgetInput) {
  return serializeResult(getUpsertRecordActivityWidgetInteractor().invoke(input));
}
