import { redirect } from "next/navigation";
import { getLocale } from "next-intl/server";

import { WEBHOOK_DELIVERIES_HREF } from "@/app/components/navigation/settings-routes";
import { buildLocalePath } from "@/i18n/locale-registry";

type Props = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export default async function WebhookDeliveriesMovedPage({ searchParams }: Props) {
  const query = new URLSearchParams(
    Object.entries(await searchParams).flatMap(([key, value]) =>
      (Array.isArray(value) ? value : value === undefined ? [] : [value]).map((item) => [key, item]),
    ),
  ).toString();
  redirect(buildLocalePath(await getLocale(), query ? `${WEBHOOK_DELIVERIES_HREF}?${query}` : WEBHOOK_DELIVERIES_HREF));
}
