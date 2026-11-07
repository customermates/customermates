import type { Metadata } from "next";

import { getTranslations } from "next-intl/server";

import { PublicDashboardView } from "./public-dashboard-view";
import { PublicLinkUnavailable } from "./public-link-frame";
import { PublicListView } from "./public-list-view";
import { visitorKey } from "./visitor-key";

import { getReadPublicLinkInteractor } from "@/core/di";

export const dynamic = "force-dynamic";

type Props = { params: Promise<{ token: string }> };

const ROBOTS = { index: false, follow: false, nocache: true, googleBot: { index: false, follow: false } };

async function read(token: string) {
  return getReadPublicLinkInteractor().invoke({ token, visitor: await visitorKey() });
}

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations();
  return { title: t("PublicLink.pageTitle"), robots: ROBOTS, referrer: "no-referrer" };
}

export default async function PublicLinkPage({ params }: Props) {
  const { token } = await params;
  const result = await read(token);
  if (result.status === "available") {
    return "list" in result ? (
      <PublicListView list={result.list} token={token} />
    ) : (
      <PublicDashboardView dashboard={result.dashboard} token={token} />
    );
  }
  return <PublicLinkUnavailable rateLimited={result.status === "rateLimited"} />;
}
