import { getTranslations } from "next-intl/server";

import { PageState } from "@/components/page-state/page-state";
import { PageContainer } from "@/components/shared/page-container";
import { ProfileSettingsPageSkeleton } from "../components/profile-settings-page-skeleton";

export default async function Loading() {
  const t = await getTranslations("PageState");
  return (
    <PageContainer>
      <PageState background={<ProfileSettingsPageSkeleton />} label={t("loading")} state="loading" />
    </PageContainer>
  );
}
