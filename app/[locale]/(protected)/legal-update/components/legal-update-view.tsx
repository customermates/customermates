"use client";

/* eslint-disable react/jsx-newline -- Legal prose deliberately mixes text and links. */

import type { LegalUpdateStatus } from "@/features/legal/legal-status.service";

import { useState, useTransition } from "react";
import { useFormatter, useTranslations } from "next-intl";
import { Loader2 } from "lucide-react";

import { AppCard } from "@/components/card/app-card";
import { AppCardBody } from "@/components/card/app-card-body";
import { AppCardFooter } from "@/components/card/app-card-footer";
import { CardHeroHeader } from "@/components/card/card-hero-header";
import { AppLink } from "@/components/shared/app-link";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { signOutAction } from "@/app/[locale]/actions";

import { acceptLegalDocumentsAction } from "../actions";

type Props = { status: LegalUpdateStatus };

export function LegalUpdateView({ status }: Props) {
  const t = useTranslations("LegalUpdateView");
  const format = useFormatter();
  const [checked, setChecked] = useState(false);
  const [isPending, startTransition] = useTransition();
  const deadline = status.effectiveAt
    ? format.dateTime(new Date(status.effectiveAt), {
        dateStyle: "long",
        timeZone: "UTC",
      })
    : null;

  return (
    <AppCard className="max-w-2xl">
      <CardHeroHeader
        subtitle={deadline ? t("subtitle", { date: deadline }) : t("informationSubtitle")}
        title={t("title")}
      />

      <AppCardBody>
        <p className="text-sm text-subdued">
          {t("description")}{" "}
          <AppLink href="/terms" target="_blank">
            {t("terms")}
          </AppLink>
          ,{" "}
          <AppLink href="/dpa" target="_blank">
            {t("dpa")}
          </AppLink>
          ,{" "}
          <AppLink href="/privacy" target="_blank">
            {t("privacy")}
          </AppLink>{" "}
          {t("and")}{" "}
          <AppLink href="/subprocessors" target="_blank">
            {t("subprocessors")}
          </AppLink>
          .
        </p>

        {status.isSystemAdministrator && status.contractNoticeSent && !status.contractAccepted ? (
          <label className="flex items-start gap-3 text-sm" htmlFor="legal-acceptance">
            <Checkbox
              aria-required="true"
              checked={checked}
              id="legal-acceptance"
              onCheckedChange={(value) => setChecked(value === true)}
            />

            <span>{t("acceptance")}</span>
          </label>
        ) : null}

        {!status.isSystemAdministrator && status.contractNoticeSent && !status.contractAccepted ? (
          <p className="text-sm text-subdued">{t("memberWaiting")}</p>
        ) : null}
      </AppCardBody>

      <AppCardFooter>
        {!status.mustAccept ? (
          <Button asChild variant="outline">
            <AppLink href="/">{t("continue")}</AppLink>
          </Button>
        ) : null}

        {status.contractNoticeSent && !status.contractAccepted ? (
          <>
            {!status.isSystemAdministrator ? (
              <Button variant="outline" onClick={() => window.location.reload()}>
                {t("retry")}
              </Button>
            ) : null}

            <Button variant="outline" onClick={() => void signOutAction()}>
              {t("signOut")}
            </Button>
          </>
        ) : null}

        {status.isSystemAdministrator && status.contractNoticeSent && !status.contractAccepted ? (
          <Button
            disabled={!checked || isPending}
            onClick={() =>
              startTransition(async () => {
                await acceptLegalDocumentsAction({
                  agreeToLegalDocuments: true,
                });
              })
            }
          >
            {isPending ? <Loader2 className="size-4 animate-spin" /> : null}

            {t("accept")}
          </Button>
        ) : null}
      </AppCardFooter>
    </AppCard>
  );
}
