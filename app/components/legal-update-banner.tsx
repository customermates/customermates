"use client";

/* eslint-disable react/jsx-newline -- Legal prose deliberately mixes text and links. */

import type { LegalUpdateStatus } from "@/features/legal/legal-status.service";

import { useEffect } from "react";
import { useFormatter, useLocale, useTranslations } from "next-intl";

import { Alert } from "@/components/shared/alert";
import { AppLink } from "@/components/shared/app-link";
import { usePathname } from "@/i18n/navigation";
import { isPublicPathname } from "@/i18n/routing";

type Props = { status: LegalUpdateStatus };

export function LegalUpdateBanner({ status }: Props) {
  const t = useTranslations("LegalUpdateBanner");
  const format = useFormatter();
  const locale = useLocale();
  const pathname = usePathname();
  const isPublicRoute = isPublicPathname(pathname);

  useEffect(() => {
    if (!status.contractNoticeSent || status.contractAccepted || !status.effectiveAt || isPublicRoute) return;

    const effectiveAt = new Date(status.effectiveAt).getTime();
    if (!Number.isFinite(effectiveAt)) return;
    let redirected = false;
    const enforceDeadline = () => {
      if (redirected || Date.now() < effectiveAt) return;
      redirected = true;
      window.location.replace(`/${locale}/legal-update`);
    };

    enforceDeadline();
    const timeout = window.setTimeout(enforceDeadline, Math.max(0, effectiveAt - Date.now()));
    window.addEventListener("focus", enforceDeadline);
    document.addEventListener("visibilitychange", enforceDeadline);

    return () => {
      window.clearTimeout(timeout);
      window.removeEventListener("focus", enforceDeadline);
      document.removeEventListener("visibilitychange", enforceDeadline);
    };
  }, [isPublicRoute, locale, status.contractAccepted, status.contractNoticeSent, status.effectiveAt]);

  if (status.contractNoticeSent && !status.contractAccepted && status.effectiveAt) {
    const date = format.dateTime(new Date(status.effectiveAt), {
      dateStyle: "medium",
      timeZone: "UTC",
    });
    return (
      <div className="px-3 pt-3 md:px-4">
        <Alert
          color="warning"
          description={
            <span>
              {status.isSystemAdministrator ? t("admin", { date }) : t("member", { date })}{" "}
              <AppLink href="/legal-update">{t("review")}</AppLink>
            </span>
          }
        />
      </div>
    );
  }

  if (status.informationNoticeVisible) {
    return (
      <div className="px-3 pt-3 md:px-4">
        <Alert
          color="primary"
          description={
            <span>
              {t("information")} <AppLink href="/legal-update">{t("review")}</AppLink>
            </span>
          }
        />
      </div>
    );
  }

  return null;
}
