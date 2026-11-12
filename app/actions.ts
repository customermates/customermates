"use server";

import type {
  DeleteDataViewData,
  HideSharedDataViewData,
  ShareDataViewData,
  SaveDataViewStateData,
  SelectDataViewData,
  UpsertDataViewData,
} from "@/features/data-view/data-view.schema";
import type { GetP13nData } from "@/features/p13n/get-p13n.interactor";
import type { UpsertP13nData } from "@/features/p13n/upsert-p13n.interactor";
import type { ManagePublicLinkData } from "@/features/public-link/public-link.schema";
import type {
  DisablePublicFormData,
  GetPublicFormEditorData,
  UpsertPublicFormData,
} from "@/features/public-form/public-form.schema";

import {
  getDeleteDataViewInteractor,
  getDisablePublicFormInteractor,
  getGetDataViewShareOptionsInteractor,
  getGetPublicFormEditorInteractor,
  getUpsertPublicFormInteractor,
  getHideSharedDataViewInteractor,
  getManagePublicLinkInteractor,
  getShareDataViewInteractor,
  getGetP13nInteractor,
  getSaveDataViewStateInteractor,
  getSelectDataViewInteractor,
  getUpsertDataViewInteractor,
  getUpsertP13nInteractor,
} from "@/core/di";
import { serializeResult } from "@/core/utils/action-result";

export async function upsertP13nAction(data: UpsertP13nData) {
  return serializeResult(getUpsertP13nInteractor().invoke(data));
}

export async function getP13nAction(data: GetP13nData) {
  return serializeResult(getGetP13nInteractor().invoke(data));
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

export async function shareDataViewAction(data: ShareDataViewData) {
  return serializeResult(getShareDataViewInteractor().invoke(data));
}

export async function managePublicLinkAction(data: ManagePublicLinkData) {
  return serializeResult(getManagePublicLinkInteractor().invoke(data));
}

export async function hideSharedDataViewAction(data: HideSharedDataViewData) {
  return serializeResult(getHideSharedDataViewInteractor().invoke(data));
}

export async function getDataViewShareOptionsAction() {
  return serializeResult(getGetDataViewShareOptionsInteractor().invoke());
}

export async function getPublicFormEditorAction(data: GetPublicFormEditorData) {
  return serializeResult(getGetPublicFormEditorInteractor().invoke(data));
}

export async function upsertPublicFormAction(data: UpsertPublicFormData) {
  return serializeResult(getUpsertPublicFormInteractor().invoke(data));
}

export async function disablePublicFormAction(data: DisablePublicFormData) {
  return serializeResult(getDisablePublicFormInteractor().invoke(data));
}
