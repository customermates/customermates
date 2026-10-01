"use server";

import type {
  DeleteDataViewData,
  GetDataViewsData,
  SaveDataViewStateData,
  SelectDataViewData,
  UpsertDataViewData,
} from "@/features/data-view/data-view.schema";
import type { GetP13nData } from "@/features/p13n/get-p13n.interactor";
import type { UpsertP13nData } from "@/features/p13n/upsert-p13n.interactor";

import {
  getDeleteDataViewInteractor,
  getGetCompanySettingsInteractor,
  getGetDataViewsInteractor,
  getGetP13nInteractor,
  getSaveDataViewStateInteractor,
  getSelectDataViewInteractor,
  getUpsertDataViewInteractor,
  getUpsertP13nInteractor,
} from "@/core/di";
import { serializeResult } from "@/core/utils/action-result";

export async function getCompanySettingsAction() {
  return serializeResult(getGetCompanySettingsInteractor().invoke());
}

export async function upsertP13nAction(data: UpsertP13nData) {
  return serializeResult(getUpsertP13nInteractor().invoke(data));
}

export async function getP13nAction(data: GetP13nData) {
  return serializeResult(getGetP13nInteractor().invoke(data));
}

export async function getDataViewsAction(data: GetDataViewsData) {
  return serializeResult(getGetDataViewsInteractor().invoke(data));
}

export async function upsertDataViewAction(data: UpsertDataViewData) {
  return serializeResult(getUpsertDataViewInteractor().invoke(data));
}

export async function deleteDataViewAction(data: DeleteDataViewData) {
  return serializeResult(getDeleteDataViewInteractor().invoke(data));
}

export async function saveDataViewStateAction(data: SaveDataViewStateData) {
  return serializeResult(getSaveDataViewStateInteractor().invoke(data));
}

export async function selectDataViewAction(data: SelectDataViewData) {
  return serializeResult(getSelectDataViewInteractor().invoke(data));
}
