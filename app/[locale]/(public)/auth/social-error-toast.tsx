"use client";

import { useEffect } from "react";
import { useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { toast } from "sonner";

import { useRouter } from "@/i18n/navigation";
import { SOCIAL_ERROR_FALLBACK_KEY, SOCIAL_ERROR_KEYS } from "./social-error-keys";

const RECOVERABLE_BY_VERIFICATION = "accountNotLinked";
const RECOVERY_TOAST_DURATION_MS = 15000;

export function SocialErrorToast() {
  const t = useTranslations();
  const router = useRouter();
  const searchParams = useSearchParams();

  useEffect(() => {
    const error = searchParams.get("error");
    if (error === null) return;

    const key = SOCIAL_ERROR_KEYS[error] ?? SOCIAL_ERROR_FALLBACK_KEY;
    const timer = setTimeout(() => {
      if (key === RECOVERABLE_BY_VERIFICATION) {
        toast.error(t(`AuthSocialErrors.${key}`), {
          duration: RECOVERY_TOAST_DURATION_MS,
          action: {
            label: t("AuthSocialErrors.accountNotLinkedAction"),
            onClick: () => router.push("/auth/verify-email"),
          },
        });
        return;
      }

      toast.error(t(`AuthSocialErrors.${key}`));
    }, 0);

    const params = new URLSearchParams(searchParams.toString());
    params.delete("error");
    const query = params.toString();
    const path = window.location.pathname;
    window.history.replaceState(null, "", query ? `${path}?${query}` : path);

    return () => clearTimeout(timer);
  }, [router, searchParams, t]);

  return null;
}
