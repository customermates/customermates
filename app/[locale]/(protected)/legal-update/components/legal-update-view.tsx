"use client";

/* eslint-disable react/jsx-newline -- Legal prose deliberately mixes text and links. */

import type { LegalUpdateStatus } from "@/features/legal/get-legal-status.interactor";

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
import { Label } from "@/components/ui/label";
import { signOutAction } from "@/app/[locale]/actions";

import { acceptLegalDocumentsAction } from "../actions";

type Props = { status: LegalUpdateStatus };

export function LegalUpdateView({ status }: Props) {
  const t = useTranslations();
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
        subtitle={
          deadline ? t("LegalUpdateView.subtitle", { date: deadline }) : t("LegalUpdateView.informationSubtitle")
        }
        title={t("LegalUpdateView.title")}
      />

      <AppCardBody>
        <p className="text-sm text-subdued">
          {t("LegalUpdateView.description")}{" "}
          <AppLink appearance="inline" href="/terms" target="_blank">
            {t("LegalUpdateView.terms")}
          </AppLink>
          ,{" "}
          <AppLink appearance="inline" href="/dpa" target="_blank">
            {t("LegalUpdateView.dpa")}
          </AppLink>
          ,{" "}
          <AppLink appearance="inline" href="/privacy" target="_blank">
            {t("LegalUpdateView.privacy")}
          </AppLink>{" "}
          {t("LegalUpdateView.and")}{" "}
          <AppLink appearance="inline" href="/subprocessors" target="_blank">
            {t("LegalUpdateView.subprocessors")}
          </AppLink>
          .
        </p>

        {status.isSystemAdministrator && status.contractNoticeSent && !status.contractAccepted ? (
          <Label className="cursor-pointer gap-3 font-normal leading-normal" htmlFor="legal-acceptance">
            <Checkbox
              aria-required="true"
              checked={checked}
              id="legal-acceptance"
              onCheckedChange={(value) => setChecked(value === true)}
            />

            <span>{t("LegalUpdateView.acceptance")}</span>
          </Label>
        ) : null}

        {!status.isSystemAdministrator && status.contractNoticeSent && !status.contractAccepted ? (
          <p className="text-sm text-subdued">{t("LegalUpdateView.memberWaiting")}</p>
        ) : null}
      </AppCardBody>

      {status.contractNoticeSent && !status.contractAccepted ? (
        <AppCardFooter>
          <Button variant="secondary" onClick={() => void signOutAction()}>
            {t("LegalUpdateView.signOut")}
          </Button>

          {!status.isSystemAdministrator ? (
            <Button onClick={() => window.location.reload()}>{t("LegalUpdateView.retry")}</Button>
          ) : null}

          {status.isSystemAdministrator ? (
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

              {t("LegalUpdateView.accept")}
            </Button>
          ) : null}
        </AppCardFooter>
      ) : null}
    </AppCard>
  );
}
