"use server";

import type { GlobalSearchData } from "@/features/search/global-search.interactor";

import { di } from "@/core/dependency-injection/container";
import { GlobalSearchInteractor } from "@/features/search/global-search.interactor";

export async function globalSearchAction(data: GlobalSearchData) {
  const interactor = di.get(GlobalSearchInteractor);

  return await interactor.invoke(data);
}
