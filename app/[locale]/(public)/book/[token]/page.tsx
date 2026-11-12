import type { Metadata } from "next";

import { getTranslations } from "next-intl/server";

import { PublicBookingUnavailable, PublicBookingView } from "./public-booking-view";

import { getReadPublicBookingInteractor } from "@/core/di";
import { env } from "@/env";

import { visitorKey } from "../../p/[token]/visitor-key";

export const dynamic = "force-dynamic";

type Props = { params: Promise<{ token: string }> };

const ROBOTS = { index: false, follow: false, nocache: true, googleBot: { index: false, follow: false } };

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations();
  return { title: t("PublicBooking.pageTitle"), robots: ROBOTS, referrer: "no-referrer" };
}

export default async function PublicBookingPage({ params }: Props) {
  const { token } = await params;
  const result =
    env.APP_MODE === "cloud"
      ? await getReadPublicBookingInteractor().invoke({ token, visitor: await visitorKey() })
      : ({ status: "unavailable" } as const);

  if (result.status === "available") return <PublicBookingView page={result.page} token={token} />;

  return <PublicBookingUnavailable rateLimited={result.status === "rateLimited"} />;
}
