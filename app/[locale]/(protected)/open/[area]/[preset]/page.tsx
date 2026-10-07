import { notFound, redirect } from "next/navigation";
import { getLocale } from "next-intl/server";

import { getGetRecordNavigationInteractor } from "@/core/di";
import { requireAccess } from "@/features/auth/next/require";
import { unwrapValidated } from "@/core/validation/validation.utils";
import { presetId } from "@/features/records/crm-preset";
import { appLinkForPlace, appLinkPath } from "@/features/docs/app-links";
import { buildLocalePath } from "@/i18n/locale-registry";

export default async function OpenAppLinkPage({
  params,
  searchParams,
}: {
  params: Promise<{ area: string; preset: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await requireAccess();
  const { area, preset } = await params;
  const { focus } = await searchParams;
  const link = appLinkForPlace(`${area}/${preset}`, typeof focus === "string" ? focus : null);
  if (!link || link.kind === "page") notFound();
  const navigation = await unwrapValidated(getGetRecordNavigationInteractor().invoke());
  const typeId = presetId(navigation.companyId, link.preset);
  if (!navigation.types.some((type) => type.id === typeId)) notFound();
  redirect(buildLocalePath(await getLocale(), appLinkPath(link, { listId: () => typeId })));
}
