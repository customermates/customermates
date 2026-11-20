import type { Metadata } from "next";

import { getTranslations } from "next-intl/server";

import { PublicBookingUnavailable } from "../../[token]/public-booking-view";

import { PublicBookingManageView } from "./public-booking-manage-view";

import { getReadPublicBookingManageInteractor } from "@/core/di";
import { visitorKey } from "@/core/network/visitor-key";

export const dynamic = "force-dynamic";

type Props = { params: Promise<{ token: string }> };

const ROBOTS = { index: false, follow: false, nocache: true, googleBot: { index: false, follow: false } };

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations();
  return { title: t("PublicBooking.manageTitle"), robots: ROBOTS, referrer: "no-referrer" };
}

export default async function PublicBookingManagePage({ params }: Props) {
  const { token } = await params;
  const result = await getReadPublicBookingManageInteractor().invoke({
    manageToken: token,
    visitor: await visitorKey(),
  });

  if (result.status === "found") return <PublicBookingManageView booking={result.booking} manageToken={token} />;

  return <PublicBookingUnavailable rateLimited={result.status === "rateLimited"} />;
}
