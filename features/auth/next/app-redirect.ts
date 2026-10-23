import "server-only";

import { headers } from "next/headers";
import { getLocale } from "next-intl/server";

import { resolveRequestAccountState } from "./resolve-account-state";

import { requestedWorkspaceSlug } from "@/core/navigation/workspace-request-header";
import { isWorkspaceAppPath, withWorkspaceHref } from "@/core/navigation/workspace-paths";
import { buildLocalePath } from "@/i18n/locale-registry";

export async function requestWorkspaceSlug(): Promise<string | null> {
  return requestedWorkspaceSlug(await headers());
}

export async function workspaceSlugForRedirect(path: string): Promise<string | null> {
  if (!isWorkspaceAppPath(path)) return null;

  const requested = await requestWorkspaceSlug();
  if (requested) return requested;

  return (await resolveRequestAccountState()).user?.company?.slug ?? null;
}

export async function appRedirectHref(path: string, locale?: string): Promise<string> {
  const slug = await workspaceSlugForRedirect(path);
  return buildLocalePath(locale ?? (await getLocale()), withWorkspaceHref(path, slug));
}
