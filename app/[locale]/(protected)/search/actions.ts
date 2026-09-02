"use server";

import type { GlobalSearchData, GlobalSearchResultItem } from "@/features/search/global-search.interactor";

import {
  getGlobalSearchInteractor,
  getGetContactByIdInteractor,
  getGetOrganizationByIdInteractor,
  getGetDealByIdInteractor,
  getGetServiceByIdInteractor,
} from "@/core/di";
import { serializeResult } from "@/core/utils/action-result";

export async function globalSearchAction(data: GlobalSearchData) {
  return serializeResult(getGlobalSearchInteractor().invoke(data));
}

export async function checkSearchResultExistsAction(data: { type: GlobalSearchResultItem["type"]; id: string }) {
  switch (data.type) {
    case "contact": {
      const result = await getGetContactByIdInteractor().invoke({ id: data.id });
      return result.ok && result.data.contact !== null;
    }
    case "organization": {
      const result = await getGetOrganizationByIdInteractor().invoke({ id: data.id });
      return result.ok && result.data.organization !== null;
    }
    case "deal": {
      const result = await getGetDealByIdInteractor().invoke({ id: data.id });
      return result.ok && result.data.deal !== null;
    }
    case "service": {
      const result = await getGetServiceByIdInteractor().invoke({ id: data.id });
      return result.ok && result.data.service !== null;
    }
  }
}
