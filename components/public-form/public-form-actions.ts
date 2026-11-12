"use server";

import type {
  DisablePublicFormData,
  GetPublicFormEditorData,
  UpsertPublicFormData,
} from "@/features/public-form/public-form.schema";

import {
  getDisablePublicFormInteractor,
  getGetPublicFormEditorInteractor,
  getUpsertPublicFormInteractor,
} from "@/core/di";
import { serializeResult } from "@/core/utils/action-result";

export async function getPublicFormEditorAction(data: GetPublicFormEditorData) {
  return serializeResult(getGetPublicFormEditorInteractor().invoke(data));
}

export async function upsertPublicFormAction(data: UpsertPublicFormData) {
  return serializeResult(getUpsertPublicFormInteractor().invoke(data));
}

export async function disablePublicFormAction(data: DisablePublicFormData) {
  return serializeResult(getDisablePublicFormInteractor().invoke(data));
}
