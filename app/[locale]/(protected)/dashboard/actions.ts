"use server";

import type { DeleteWidgetData } from "@/features/widget/delete-widget.interactor";
import type { GetWidgetByIdData } from "@/features/widget/get-widget-by-id.interactor";
import type { UpsertWidgetData } from "@/features/widget/upsert-widget.interactor";
import type { UpdateWidgetLayoutsData } from "@/features/widget/update-widget-layouts.interactor";
import type { UpdateUserDetailsData } from "@/features/user/upsert/update-user-details.interactor";

import {
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
