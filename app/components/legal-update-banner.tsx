"use client";

/* eslint-disable react/jsx-newline -- Legal prose deliberately mixes text and links. */

import type { LegalUpdateStatus } from "@/features/legal/get-legal-status.interactor";

import { useFormatter, useTranslations } from "next-intl";

import { Alert } from "@/components/shared/alert";
import { AppLink } from "@/components/shared/app-link";
type Props = { status: LegalUpdateStatus };

export function LegalUpdateBanner({ status }: Props) {
  const t = useTranslations();
  const format = useFormatter();

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
              {status.isSystemAdministrator
                ? t("LegalUpdateBanner.admin", { date })
                : t("LegalUpdateBanner.member", { date })}{" "}
              <AppLink appearance="inline" href="/legal-update">
                {t("LegalUpdateBanner.review")}
              </AppLink>
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
              {t("LegalUpdateBanner.information")}{" "}
              <AppLink appearance="inline" href="/legal-update">
                {t("LegalUpdateBanner.review")}
              </AppLink>
            </span>
          }
        />
      </div>
    );
  }

  return null;
}
