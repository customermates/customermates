import "server-only";

import { notFound, redirect } from "next/navigation";
import { getLocale } from "next-intl/server";
import { z } from "zod";

import { requireAccess } from "@/features/auth/next/require";
import { resolveRequestAccountState } from "@/features/auth/next/resolve-account-state";
import { presetId } from "@/features/records/crm-preset";
import { buildLocalePath } from "@/i18n/locale-registry";

type LegacyKind = "contact" | "organization" | "deal" | "service" | "task";

export async function redirectLegacyRecordRoute(
  kind: LegacyKind,
  recordId?: string,
  searchParams?: Promise<Record<string, string | string[] | undefined>>,
): Promise<never> {
  await requireAccess();
  const { user } = await resolveRequestAccountState();
  if (!user || (recordId && !z.uuid().safeParse(recordId).success)) notFound();
  const route = `/records/${presetId(user.companyId, kind)}${recordId ? `/${recordId}` : ""}`;
  const target = buildLocalePath(await getLocale(), route);
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries((await searchParams) ?? {})) {
    if (typeof value === "string") query.set(key, value);
    else if (Array.isArray(value)) for (const part of value) query.append(key, part);
  }
  redirect(query.size ? `${target}?${query}` : target);
}
