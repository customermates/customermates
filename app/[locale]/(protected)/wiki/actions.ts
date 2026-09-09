"use server";

import type { CreateWikiPagesData } from "@/features/wiki/create-wiki-pages.interactor";
import type { DeleteWikiPageData } from "@/features/wiki/delete-wiki-page.interactor";
import type { UpdateWikiPageData } from "@/features/wiki/update-wiki-page.interactor";

import { getCreateWikiPagesInteractor, getDeleteWikiPageInteractor, getUpdateWikiPageInteractor } from "@/core/di";
import { serializeResult } from "@/core/utils/action-result";

export async function createWikiPagesAction(data: CreateWikiPagesData) {
  return serializeResult(getCreateWikiPagesInteractor().invoke(data));
}

export async function updateWikiPageAction(data: UpdateWikiPageData) {
  return serializeResult(getUpdateWikiPageInteractor().invoke(data));
}

export async function deleteWikiPageAction(data: DeleteWikiPageData) {
  return serializeResult(getDeleteWikiPageInteractor().invoke(data));
}
