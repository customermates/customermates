"use client";

import { ArrowRight } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useEffect, useState } from "react";

import { withCampaignParams } from "@/features/acquisition/campaign-link";
import { SIGNUP_PATH } from "@/features/acquisition/signup-link";
import { CLOUD_ORIGIN } from "@/features/onboarding-templates/cloud-signup-url";
import { buildLocalePath } from "@/i18n/locale-registry";

let firstDemoUrl: string | null = null;

export function DemoSignupButton() {
  const t = useTranslations();
  const locale = useLocale();
  const [href, setHref] = useState<string | null>(null);

  useEffect(() => {
    if (window.self !== window.top) return;
    firstDemoUrl ??= window.location.href;
    const signup = new URL(buildLocalePath(locale, SIGNUP_PATH), CLOUD_ORIGIN);
    signup.searchParams.set("job", "workspace");
    setHref(withCampaignParams(signup.toString(), firstDemoUrl, { signupOrigins: [CLOUD_ORIGIN] }));
  }, [locale]);

  if (!href) return null;

  return (
    <a
      className="flex w-full items-center justify-center gap-1.5 rounded-md bg-foreground px-3 py-2 text-sm font-medium text-background transition-opacity hover:opacity-90"
      data-demo-signup=""
      href={href}
    >
      {t("DemoSignup.cta")}

      <ArrowRight aria-hidden className="size-3.5" />
    </a>
  );
}
