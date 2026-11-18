"use server";

import { resolveSignInEntry, searchParamsOf } from "./sign-in-entry";

const MAX_SEARCH_LENGTH = 8192;

export async function resolveSignInEntryAction(search: string) {
  return resolveSignInEntry(searchParamsOf(typeof search === "string" ? search.slice(0, MAX_SEARCH_LENGTH) : ""));
}
