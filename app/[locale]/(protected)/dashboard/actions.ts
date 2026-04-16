"use server";

import type { DeleteWidgetData } from "@/features/widget/delete-widget.interactor";
import type { GetWidgetByIdData } from "@/features/widget/get-widget-by-id.interactor";
import type { UpsertWidgetData } from "@/features/widget/upsert-widget.interactor";
import type { UpdateWidgetLayoutsData } from "@/features/widget/update-widget-layouts.interactor";
import type { UpdateUserSettingsData } from "@/features/user/upsert/update-user-settings.interactor";

import {
  getUpsertWidgetInteractor,
  getDeleteWidgetInteractor,
  getGetCompanyWidgetsInteractor,
  getGetWidgetByIdInteractor,
  getUpdateWidgetLayoutsInteractor,
  getGetWidgetsInteractor,
  getUpdateUserSettingsInteractor,
} from "@/core/di";
import { serializeResult } from "@/core/utils/action-result";

export async function upsertWidgetAction(data: UpsertWidgetData) {
  return serializeResult(getUpsertWidgetInteractor().invoke(data));
}

export async function deleteWidgetAction(data: DeleteWidgetData) {
  const result = await getDeleteWidgetInteractor().invoke(data);
  return result.data;
}

export async function getCompanyWidgetsAction() {
  const result = await getGetCompanyWidgetsInteractor().invoke();
  return result.data;
}

export async function getWidgetByIdAction(data: GetWidgetByIdData) {
  const result = await getGetWidgetByIdInteractor().invoke(data);
  return result.data;
}

export async function updateWidgetLayoutsAction(data: UpdateWidgetLayoutsData) {
  const result = await getUpdateWidgetLayoutsInteractor().invoke(data);
  return result.data;
}

export async function refreshWidgetsAction() {
  const result = await getGetWidgetsInteractor().invoke();
  return result.data;
}

export async function updateThemeAction(data: UpdateUserSettingsData) {
  return getUpdateUserSettingsInteractor().invoke(data);
}
