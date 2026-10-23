import { redirect } from "next/navigation";
import { getLocale } from "next-intl/server";

import { demoDefaultWorkspaceSlug } from "@/core/solutions/solution-catalog";
import {
  WORKSPACE_ENTRY_TARGET_PARAM,
  workspaceEntryTarget,
  workspaceLocalePath,
} from "@/core/navigation/workspace-paths";
import { env } from "@/env";
import { buildLocalePath } from "@/i18n/locale-registry";
import { requireAccess } from "@/features/auth/next/require";
import { resolveRequestAccountState } from "@/features/auth/next/resolve-account-state";

type Props = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

function searchOf(params: Record<string, string | string[] | undefined>): string {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params))
    for (const entry of Array.isArray(value) ? value : value === undefined ? [] : [value]) search.append(key, entry);

  const serialized = search.toString();
  return serialized ? `?${serialized}` : "";
}

export default async function WorkspaceEntryPage({ searchParams }: Props) {
  await requireAccess();

  const { user } = await resolveRequestAccountState();
  const locale = await getLocale();
  const slug = env.APP_MODE === "demo" ? demoDefaultWorkspaceSlug(locale) : user?.company?.slug;
  if (!slug) redirect(buildLocalePath(locale, "/onboarding"));

  const { [WORKSPACE_ENTRY_TARGET_PARAM]: target, ...rest } = await searchParams;
  redirect(`${workspaceLocalePath(locale, slug, workspaceEntryTarget(target))}${searchOf(rest)}`);
}
