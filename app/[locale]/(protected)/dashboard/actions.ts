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
  getGetWidgetByIdInteractor,
  getGetWidgetsInteractor,
  getPreviewRecordWidgetInteractor,
  getUpdateUserDetailsInteractor,
  getUpdateWidgetLayoutsInteractor,
  getUpsertRecordActivityWidgetInteractor,
  getUpsertRecordWidgetInteractor,
} from "@/core/di";
import { serializeResult } from "@/core/utils/action-result";
import { unwrapValidated } from "@/core/validation/validation.utils";

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
  return unwrapValidated(getGetWidgetsInteractor().invoke({ viewId }));
}

export async function updatePreferencesAction(data: UpdateUserDetailsData) {
  return serializeResult(getUpdateUserDetailsInteractor().invoke(data));
}

export async function upsertRecordWidgetAction(input: RecordWidgetInput) {
  return serializeResult(getUpsertRecordWidgetInteractor().invoke(input));
}

export async function discoverWidgetRecordTypesAction(params: { searchTerm?: string }) {
  const data = await unwrapValidated(
    getDiscoverRecordTypesInteractor().invoke({
      search: params.searchTerm,
      includeEmbedded: true,
      page: 1,
      pageSize: 100,
    }),
  );
  return {
    items: data.types.filter((type) =>
      type.permittedActions.some((action) => action === "readOwn" || action === "readAll"),
    ),
    total: data.total,
  };
}

export async function previewRecordWidgetAction(measure: RecordMeasure) {
  return serializeResult(getPreviewRecordWidgetInteractor().invoke(measure));
}

export async function upsertRecordActivityWidgetAction(input: RecordActivityWidgetInput) {
  return serializeResult(getUpsertRecordActivityWidgetInteractor().invoke(input));
}
