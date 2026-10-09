import { redirect } from "next/navigation";
import { getLocale } from "next-intl/server";

import { buildLocalePath } from "@/i18n/locale-registry";
import { configurationTrashHref } from "@/features/trash/trash-routes";

type Props = { searchParams: Promise<Record<string, string | string[] | undefined>> };

export default async function RecentlyDeletedRedirect({ searchParams }: Props) {
  const { focus } = await searchParams;
  redirect(buildLocalePath(await getLocale(), configurationTrashHref(typeof focus === "string" ? focus : undefined)));
}
