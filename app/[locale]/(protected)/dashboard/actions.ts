"use server";

import type { RecordMeasure } from "@/features/records/record-measure.schema";
import type { RecordActivityWidgetInput } from "@/features/widget/record-activity-widget.schema";

import type { UpdateUserDetailsData } from "@/features/user/upsert/update-user-details.interactor";
import type { DeleteWidgetData } from "@/features/widget/delete-widget.interactor";
import type { GetWidgetByIdData } from "@/features/widget/get-widget-by-id.interactor";
import type { RecordWidgetInput } from "@/features/widget/record-widget.schema";
import type { UpdateWidgetLayoutsData } from "@/features/widget/update-widget-layouts.interactor";

import {
  getDeleteWidgetInteractor,
  getDiscoverRecordTypesInteractor,
  getGetCompanyWidgetsInteractor,
  getGetRecordWidgetInteractor,
  getGetRecordWidgetsInteractor,
  getGetWidgetByIdInteractor,
  getGetWidgetsInteractor,
  getPreviewRecordWidgetInteractor,
  getUpdateUserDetailsInteractor,
  getUpdateWidgetLayoutsInteractor,
  getUpsertRecordActivityWidgetInteractor,
  getUpsertRecordWidgetInteractor,
} from "@/core/di";
import { serializeResult } from "@/core/utils/action-result";

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

export async function refreshWidgetsAction(viewId?: string) {
  const result = await getGetWidgetsInteractor().invoke({ viewId });
  return result.data;
}

export async function updatePreferencesAction(data: UpdateUserDetailsData) {
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
  return serializeResult(getPreviewRecordWidgetInteractor().invoke(measure));
}

export async function upsertRecordActivityWidgetAction(input: RecordActivityWidgetInput) {
  return serializeResult(getUpsertRecordActivityWidgetInteractor().invoke(input));
}
