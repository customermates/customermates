"use server";

import type { SignInEntry } from "./sign-in-entry";

import { resolveSignInEntry, searchParamsOf } from "./sign-in-entry";

import { enabledSocialProviders } from "@/core/auth/better-auth";

const MAX_SEARCH_LENGTH = 8192;

export async function resolveSignInEntryAction(search: string): Promise<SignInEntry> {
  const entry = await resolveSignInEntry(
    searchParamsOf(typeof search === "string" ? search.slice(0, MAX_SEARCH_LENGTH) : ""),
  );
  return { ...entry, socialProviders: { ...enabledSocialProviders } };
}
