import { redirect } from "next/navigation";
import { getLocale } from "next-intl/server";

import { PlanPausedCard } from "./plan-paused-card";

import { CenteredCardPage } from "@/components/shared/centered-card-page";
import { getGetPlanPauseStateInteractor } from "@/core/di";
import { requireAccountState } from "@/features/auth/next/require";
import { buildLocalePath } from "@/i18n/locale-registry";
import { NOINDEX_METADATA } from "@/core/seo/noindex-metadata";

export const metadata = NOINDEX_METADATA;

export default async function PlanPausedPage() {
  const resolution = await requireAccountState("inactive");
  const pause = resolution.user
    ? await getGetPlanPauseStateInteractor().invoke(resolution.user.id)
    : { paused: false as const };
  if (!pause.paused) redirect(buildLocalePath(await getLocale(), "/auth/error?type=inactiveUser"));

  return (
    <CenteredCardPage>
      <PlanPausedCard ownerName={pause.ownerName} />
    </CenteredCardPage>
  );
}
