import type { Metadata } from "next";

import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";

import { TurnOffNotificationEmailsView } from "./turn-off-notification-emails-view";

import { getSetNotificationKindOffInteractor } from "@/core/di";

export const dynamic = "force-dynamic";

type Props = { searchParams: Promise<{ token?: string | string[] }> };

const ROBOTS = { index: false, follow: false, nocache: true, googleBot: { index: false, follow: false } };

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations();
  return { title: t("Notifications.preferences.title"), robots: ROBOTS, referrer: "no-referrer" };
}

export default async function TurnOffNotificationEmailsPage({ searchParams }: Props) {
  const { token } = await searchParams;
  if (typeof token !== "string") notFound();

  const result = await getSetNotificationKindOffInteractor().invoke({ token, confirmed: false });
  if (!result.ok || result.data.status !== "pending") notFound();

  const t = await getTranslations();
  const kindLabels = {
    dueToday: t("Notifications.kinds.dueToday"),
    replyReceived: t("Notifications.kinds.replyReceived"),
    ruleAlert: t("Notifications.kinds.ruleAlert"),
  };

  return <TurnOffNotificationEmailsView kindLabel={kindLabels[result.data.kind]} token={token} />;
}
