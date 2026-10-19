import { notFound, redirect } from "next/navigation";
import { getLocale } from "next-intl/server";

import { getGetRecordNavigationInteractor } from "@/core/di";
import { requireAccess } from "@/features/auth/next/require";
import { unwrapPage } from "@/core/validation/next/unwrap-page";
import { presetId } from "@/features/records/crm-preset";
import { RECORD_PRESET_KEYS } from "@/features/records/workspace-record-preset";
import { buildLocalePath } from "@/i18n/locale-registry";

export default async function OpenAppRecordLinkPage({
  params,
}: {
  params: Promise<{ area: string; preset: string; recordId: string }>;
}) {
  await requireAccess();
  const { area, preset, recordId } = await params;
  if (area !== "records" || !RECORD_PRESET_KEYS.some((key) => key === preset)) notFound();
  const navigation = await unwrapPage(getGetRecordNavigationInteractor().invoke());
  const typeId = presetId(navigation.companyId, preset);
  if (!navigation.types.some((type) => type.id === typeId)) notFound();
  redirect(buildLocalePath(await getLocale(), `/records/${typeId}/${encodeURIComponent(recordId)}`));
}
