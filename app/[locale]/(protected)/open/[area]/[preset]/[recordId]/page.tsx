import { notFound, redirect } from "next/navigation";
import { getLocale } from "next-intl/server";

import { getGetRecordNavigationInteractor } from "@/core/di";
import { requireAccess } from "@/features/auth/next/require";
import { unwrapPage } from "@/core/validation/next/unwrap-page";
import { retiredStarterListTypeId } from "@/features/records/retired-starter-list";
import { buildLocalePath } from "@/i18n/locale-registry";

export default async function OpenAppRecordLinkPage({
  params,
}: {
  params: Promise<{ area: string; preset: string; recordId: string }>;
}) {
  await requireAccess();
  const { area, preset, recordId } = await params;
  if (area !== "records") notFound();
  const navigation = await unwrapPage(getGetRecordNavigationInteractor().invoke());
  const typeId = retiredStarterListTypeId(navigation.companyId, preset);
  if (!typeId || !navigation.types.some((type) => type.id === typeId)) notFound();
  redirect(buildLocalePath(await getLocale(), `/records/${typeId}/${encodeURIComponent(recordId)}`));
}
