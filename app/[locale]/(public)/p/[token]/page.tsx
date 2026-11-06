import type { Metadata } from "next";

import { createHash } from "node:crypto";
import { headers } from "next/headers";
import { getTranslations } from "next-intl/server";

import { PublicDashboardView, PublicLinkUnavailable } from "./public-dashboard-view";

import { getReadPublicLinkInteractor } from "@/core/di";

export const dynamic = "force-dynamic";

type Props = { params: Promise<{ token: string }> };

const ROBOTS = { index: false, follow: false, nocache: true, googleBot: { index: false, follow: false } };

async function visitorKey(): Promise<string | null> {
  const list = await headers();
  const address = list.get("x-forwarded-for")?.split(",")[0]?.trim() || list.get("x-real-ip");
  return address ? createHash("sha256").update(address).digest("hex").slice(0, 32) : null;
}

async function read(token: string) {
  return getReadPublicLinkInteractor().invoke({ token, visitor: await visitorKey() });
}

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations();
  return { title: t("PublicLink.pageTitle"), robots: ROBOTS, referrer: "no-referrer" };
}

export default async function PublicDashboardPage({ params }: Props) {
  const { token } = await params;
  const result = await read(token);
  if (result.status === "available") return <PublicDashboardView dashboard={result.dashboard} />;
  return <PublicLinkUnavailable rateLimited={result.status === "rateLimited"} />;
}
