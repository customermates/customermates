"use server";

import type { CreateWikiPagesData } from "@/features/wiki/create-wiki-pages.interactor";
import type { DeleteWikiPageData } from "@/features/wiki/delete-wiki-page.interactor";
import type { UpdateWikiPageData } from "@/features/wiki/update-wiki-page.interactor";
import type { WikiPageListData, WikiPageSearchData } from "@/features/wiki/wiki.schema";

import {
  getCreateWikiPagesInteractor,
  getDeleteWikiPageInteractor,
  getGetWikiPageInteractor,
  getGetWikiPagesInteractor,
  getSearchWikiPagesInteractor,
  getUpdateWikiPageInteractor,
} from "@/core/di";
import { serializeResult } from "@/core/utils/action-result";
import { CustomErrorCode } from "@/core/validation/validation.types";

function isWikiPageConcurrencyConflict(error: { issues: Array<{ code: string; params?: { error?: unknown } }> }) {
  return error.issues.some(
    (issue) => issue.code === "custom" && issue.params?.error === CustomErrorCode.wikiPageConflict,
  );
}

export async function createWikiPagesAction(data: CreateWikiPagesData) {
  return serializeResult(getCreateWikiPagesInteractor().invoke(data));
}

export async function updateWikiPageAction(data: UpdateWikiPageData) {
  const result = await getUpdateWikiPageInteractor().invoke(data);
  return {
    ...(await serializeResult(result)),
    conflict: !result.ok && isWikiPageConcurrencyConflict(result.error),
  };
}

export async function deleteWikiPageAction(data: DeleteWikiPageData) {
  const result = await getDeleteWikiPageInteractor().invoke(data);
  return {
    ...(await serializeResult(result)),
    conflict: !result.ok && isWikiPageConcurrencyConflict(result.error),
  };
}

export async function getWikiPageAction(id: string) {
  return serializeResult(getGetWikiPageInteractor().invoke({ id }));
}

export async function listWikiPagesAction(data: WikiPageListData) {
  return serializeResult(getGetWikiPagesInteractor().invoke(data));
}

export async function searchWikiPagesAction(data: WikiPageSearchData) {
  return serializeResult(getSearchWikiPagesInteractor().invoke(data));
}
