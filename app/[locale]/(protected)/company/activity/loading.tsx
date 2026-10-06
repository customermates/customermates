import { getTranslations } from "next-intl/server";

import { PageState } from "@/components/page-state/page-state";
import { PageContainer } from "@/components/shared/page-container";
import { ActivityTimelineSkeleton } from "@/features/messaging/activities/activity-timeline-skeleton";

export default async function Loading() {
  const t = await getTranslations("PageState");
  return (
    <PageContainer>
      <PageState
        background={
          <div className="mx-auto w-full max-w-3xl">
            <ActivityTimelineSkeleton />
          </div>
        }
        label={t("loading")}
        state="loading"
      />
    </PageContainer>
  );
}
