"use server";

import type { DeleteWidgetData } from "@/features/widget/delete-widget.interactor";
import type { GetWidgetByIdData } from "@/features/widget/get-widget-by-id.interactor";
import type { UpsertWidgetData } from "@/features/widget/upsert-widget.interactor";
import type { UpdateWidgetLayoutsData } from "@/features/widget/update-widget-layouts.interactor";
import type { UpdateUserSettingsData } from "@/features/user/upsert/update-user-settings.interactor";

import { di } from "@/core/dependency-injection/container";
import { DeleteWidgetInteractor } from "@/features/widget/delete-widget.interactor";
import { GetCompanyWidgetsInteractor } from "@/features/widget/get-company-widgets.interactor";
import { GetWidgetByIdInteractor } from "@/features/widget/get-widget-by-id.interactor";
import { UpsertWidgetInteractor } from "@/features/widget/upsert-widget.interactor";
import { UpdateWidgetLayoutsInteractor } from "@/features/widget/update-widget-layouts.interactor";
import { GetWidgetsInteractor } from "@/features/widget/get-widgets.interactor";
import { UpdateUserSettingsInteractor } from "@/features/user/upsert/update-user-settings.interactor";
import { serializeResult } from "@/core/utils/action-result";

export async function upsertWidgetAction(data: UpsertWidgetData) {
  return serializeResult(di.get(UpsertWidgetInteractor).invoke(data));
}

export async function deleteWidgetAction(data: DeleteWidgetData) {
  return di.get(DeleteWidgetInteractor).invoke(data);
}

export async function getCompanyWidgetsAction() {
  return di.get(GetCompanyWidgetsInteractor).invoke();
}

export async function getWidgetByIdAction(data: GetWidgetByIdData) {
  return di.get(GetWidgetByIdInteractor).invoke(data);
}

export async function updateWidgetLayoutsAction(data: UpdateWidgetLayoutsData) {
  return di.get(UpdateWidgetLayoutsInteractor).invoke(data);
}

export async function refreshWidgetsAction() {
  return di.get(GetWidgetsInteractor).invoke();
}

export async function updateThemeAction(data: UpdateUserSettingsData) {
  return di.get(UpdateUserSettingsInteractor).invoke(data);
}
