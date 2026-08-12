"use client";

import { useEffect } from "react";
import { useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { toast } from "sonner";

import { SOCIAL_ERROR_FALLBACK_KEY, SOCIAL_ERROR_KEYS } from "./social-error-keys";

export function SocialErrorToast() {
  const t = useTranslations();
  const searchParams = useSearchParams();

  useEffect(() => {
    const error = searchParams.get("error");
    if (error === null) return;

    const key = SOCIAL_ERROR_KEYS[error] ?? SOCIAL_ERROR_FALLBACK_KEY;
    const timer = setTimeout(() => {
      toast.error(t(`AuthSocialErrors.${key}`));
    }, 0);

    const params = new URLSearchParams(searchParams.toString());
    params.delete("error");
    const query = params.toString();
    const path = window.location.pathname;
    window.history.replaceState(null, "", query ? `${path}?${query}` : path);

    return () => clearTimeout(timer);
  }, [searchParams, t]);

  return null;
}
