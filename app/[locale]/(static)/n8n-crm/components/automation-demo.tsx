"use client";

import { ShowcaseFrame } from "@/components/marketing/showcase-frame";
import { AppImage } from "@/components/shared/app-image";
import { useTranslations } from "next-intl";

export function AutomationDemo() {
  const t = useTranslations();

  return (
    <ShowcaseFrame>
      <AppImage
        alt={t("N8nPage.automationImageAlt")}
        className="w-full h-auto rounded-none"
        height={1080}
        loading="eager"
        src="automation-hero.png"
        width={1920}
      />
    </ShowcaseFrame>
  );
}
