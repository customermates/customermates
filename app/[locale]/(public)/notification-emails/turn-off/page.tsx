import type { Metadata } from "next";

import { getLocale, getTranslations } from "next-intl/server";

import {
  TurnOffNotificationEmailsView,
  type TurnOffNotificationEmailsState,
} from "./turn-off-notification-emails-view";

import { getSetNotificationKindOffInteractor } from "@/core/di";
import { absoluteWorkspaceUrl } from "@/core/navigation/workspace-paths";
import { env } from "@/env";

export const dynamic = "force-dynamic";

type Props = { searchParams: Promise<{ token?: string | string[] }> };

const ROBOTS = { index: false, follow: false, nocache: true, googleBot: { index: false, follow: false } };

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations();
  return { title: t("Notifications.preferences.title"), robots: ROBOTS, referrer: "no-referrer" };
}

async function resolveState(token: string | string[] | undefined): Promise<TurnOffNotificationEmailsState> {
  if (typeof token !== "string") return { status: "invalid" };
  const result = await getSetNotificationKindOffInteractor().invoke({ token, confirmed: false });
  if (!result.ok || result.data.status === "invalid") return { status: "invalid" };
  if (result.data.status === "expired") return { status: "expired" };

  const t = await getTranslations();
  const kindLabels = {
    dueToday: t("Notifications.kinds.dueToday"),
    replyReceived: t("Notifications.kinds.replyReceived"),
    ruleAlert: t("Notifications.kinds.ruleAlert"),
  };
  const { kind, maskedEmail, status, workspaceName, workspaceSlug } = result.data;
  const details = { kindLabel: kindLabels[kind], maskedEmail, workspaceName };
  if (status === "pending") return { status: "pending", token, ...details };
  return {
    status: "off",
    settingsHref: absoluteWorkspaceUrl(env.BASE_URL, await getLocale(), workspaceSlug, "/settings/profile"),
    ...details,
  };
}

export default async function TurnOffNotificationEmailsPage({ searchParams }: Props) {
  const { token } = await searchParams;

  return <TurnOffNotificationEmailsView state={await resolveState(token)} />;
}
