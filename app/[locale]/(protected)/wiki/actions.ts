"use server";

import type { StartWikiHomepageSetupData } from "@/features/wiki/start-wiki-homepage-setup.interactor";
import type { CreateWikiPagesData } from "@/features/wiki/create-wiki-pages.interactor";
import type { DeleteWikiPageData } from "@/features/wiki/delete-wiki-page.interactor";
import type { MoveWikiPageData } from "@/features/wiki/move-wiki-page.interactor";
import type { UpdateWikiPageData } from "@/features/wiki/update-wiki-page.interactor";
import type { WikiPageListData, WikiPageSearchData } from "@/features/wiki/wiki.schema";

import {
  getCreateWikiPagesInteractor,
  getDeleteWikiPageInteractor,
  getGetWikiPageInteractor,
  getGetWikiPagesInteractor,
  getGetWikiHomepageSetupStateInteractor,
  getSearchWikiPagesInteractor,
  getStartWikiHomepageSetupInteractor,
  getUpdateWikiPageInteractor,
  getMoveWikiPageInteractor,
} from "@/core/di";
import { serializeResult, serializeTypedResult } from "@/core/utils/action-result";

export async function createWikiPagesAction(data: CreateWikiPagesData) {
  return serializeTypedResult(getCreateWikiPagesInteractor().invoke(data));
}

export async function moveWikiPageAction(data: MoveWikiPageData) {
  return serializeResult(getMoveWikiPageInteractor().invoke(data));
}

export async function updateWikiPageAction(data: UpdateWikiPageData) {
  return serializeTypedResult(getUpdateWikiPageInteractor().invoke(data));
}

export async function deleteWikiPageAction(data: DeleteWikiPageData) {
  return serializeTypedResult(getDeleteWikiPageInteractor().invoke(data));
}

export async function getWikiPageAction(id: string) {
  return serializeResult(getGetWikiPageInteractor().invoke({ id }));
}

export async function getWikiPagesAction(data: WikiPageListData) {
  return serializeResult(getGetWikiPagesInteractor().invoke(data));
}

export async function getWikiHomepageSetupStateAction() {
  return serializeResult(getGetWikiHomepageSetupStateInteractor().invoke());
}

export async function searchWikiPagesAction(data: WikiPageSearchData) {
  return serializeResult(getSearchWikiPagesInteractor().invoke(data));
}

export async function startWikiHomepageSetupAction(data: StartWikiHomepageSetupData) {
  return serializeResult(getStartWikiHomepageSetupInteractor().invoke(data));
}
