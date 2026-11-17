import "server-only";

import { appRedirectHref } from "@/features/auth/next/app-redirect";
import { requireAccess } from "@/features/auth/next/require";

import { connectionsRedirectHref, type ConnectionsRedirectSlug } from "./connection-tabs";

type SearchParams = Record<string, string | string[] | undefined>;

export async function connectionsRedirectTarget(
  slug: ConnectionsRedirectSlug,
  searchParams: Promise<SearchParams>,
): Promise<string> {
  await requireAccess();

  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(await searchParams))
    for (const item of Array.isArray(value) ? value : value === undefined ? [] : [value]) search.append(key, item);

  return appRedirectHref(connectionsRedirectHref(slug, search));
}
