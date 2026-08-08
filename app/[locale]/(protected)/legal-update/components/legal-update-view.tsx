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
          <label className="flex items-start gap-3 text-sm" htmlFor="legal-acceptance">
            <Checkbox
              aria-required="true"
              checked={checked}
              id="legal-acceptance"
              onCheckedChange={(value) => setChecked(value === true)}
            />

            <span>{t("LegalUpdateView.acceptance")}</span>
          </label>
        ) : null}

        {!status.isSystemAdministrator && status.contractNoticeSent && !status.contractAccepted ? (
          <p className="text-sm text-subdued">{t("LegalUpdateView.memberWaiting")}</p>
        ) : null}
      </AppCardBody>

      <AppCardFooter>
        {!status.mustAccept ? (
          <Button asChild variant="outline">
            <AppLink href="/">{t("LegalUpdateView.continue")}</AppLink>
          </Button>
        ) : null}

        {status.contractNoticeSent && !status.contractAccepted ? (
          <>
            {!status.isSystemAdministrator ? (
              <Button variant="outline" onClick={() => window.location.reload()}>
                {t("LegalUpdateView.retry")}
              </Button>
            ) : null}

            <Button variant="outline" onClick={() => void signOutAction()}>
              {t("LegalUpdateView.signOut")}
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

            {t("LegalUpdateView.accept")}
          </Button>
        ) : null}
      </AppCardFooter>
    </AppCard>
  );
}
