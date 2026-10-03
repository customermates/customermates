import "server-only";

import { notFound, redirect } from "next/navigation";
import { getLocale } from "next-intl/server";
import { z } from "zod";

import { requireAccess } from "@/features/auth/next/require";
import { resolveRequestAccountState } from "@/features/auth/next/resolve-account-state";
import { presetId } from "@/features/records/crm-preset";
import { buildLocalePath } from "@/i18n/locale-registry";
import { SURFACE, recordSurfaceKey } from "@/core/data-view/data-view-keys";

type LegacyKind = "contact" | "organization" | "deal" | "service" | "task";
const legacySurfaces = {
  contact: SURFACE.contacts,
  organization: SURFACE.organizations,
  deal: SURFACE.deals,
  service: SURFACE.services,
  task: SURFACE.tasks,
};

export async function redirectLegacyRecordRoute(
  kind: LegacyKind,
  recordId?: string,
  searchParams?: Promise<Record<string, string | string[] | undefined>>,
): Promise<never> {
  await requireAccess();
  const { user } = await resolveRequestAccountState();
  if (!user || (recordId && !z.uuid().safeParse(recordId).success)) notFound();
  const typeId = presetId(user.companyId, kind);
  const route = `/records/${typeId}${recordId ? `/${recordId}` : ""}`;
  const target = buildLocalePath(await getLocale(), route);
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries((await searchParams) ?? {})) {
    if (typeof value === "string") query.set(key, value);
    else if (Array.isArray(value)) for (const part of value) query.append(key, part);
  }
  if (query.getAll("viewSurface").length === 1 && query.get("viewSurface") === legacySurfaces[kind])
    query.set("viewSurface", recordSurfaceKey(typeId));
  redirect(query.size ? `${target}?${query}` : target);
}
