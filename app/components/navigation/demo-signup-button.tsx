"use client";

import { ArrowRight } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import { withCampaignParams } from "@/features/acquisition/campaign-link";
import { CLOUD_ORIGIN, cloudMateSignupUrl } from "@/features/onboarding-templates/cloud-signup-url";

let firstDemoUrl: string | null = null;

export function DemoSignupButton() {
  const t = useTranslations();
  const locale = useLocale();
  const [href, setHref] = useState<string | null>(null);

  useEffect(() => {
    if (window.self !== window.top) return;
    firstDemoUrl ??= window.location.href;
    setHref(withCampaignParams(cloudMateSignupUrl(locale), firstDemoUrl, { signupOrigins: [CLOUD_ORIGIN] }));
  }, [locale]);

  if (!href) return null;

  return (
    <Button asChild className="w-full" size="sm" variant="ink">
      <a data-demo-signup="" href={href}>
        {t("DemoSignup.cta")}

        <ArrowRight aria-hidden />
      </a>
    </Button>
  );
}
