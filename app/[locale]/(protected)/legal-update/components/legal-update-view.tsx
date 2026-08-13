"use client";

/* eslint-disable react/jsx-newline -- Legal prose deliberately mixes text and links. */

import type { LegalUpdateStatus } from "@/features/legal/get-legal-status.interactor";

import { useEffect } from "react";
import { useFormatter, useTranslations } from "next-intl";
import { observer } from "mobx-react-lite";

import { AppCard } from "@/components/card/app-card";
import { AppCardBody } from "@/components/card/app-card-body";
import { AppCardFooter } from "@/components/card/app-card-footer";
import { CardHeroHeader } from "@/components/card/card-hero-header";
import { AppLink } from "@/components/shared/app-link";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { useRootStore } from "@/core/stores/root-store.provider";

type Props = { status: LegalUpdateStatus };

export const LegalUpdateView = observer(({ status }: Props) => {
  const t = useTranslations();
  const format = useFormatter();
  const { legalUpdateStore: store, loadingOverlayStore } = useRootStore();

  useEffect(() => store.onInitOrRefresh(), [store]);

  const deadline = status.effectiveAt
    ? format.dateTime(new Date(status.effectiveAt), {
        dateStyle: "long",
        timeZone: "UTC",
      })
    : null;

  return (
    <AppCard className="max-w-2xl">
      <CardHeroHeader
        subtitle={deadline ? t("LegalUpdateView.subtitle", { date: deadline }) : undefined}
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

        {status.isSystemAdministrator ? (
          <Label className="cursor-pointer gap-3 font-normal leading-normal" htmlFor="legal-acceptance">
            <Checkbox
              aria-required="true"
              checked={store.checked}
              id="legal-acceptance"
              onCheckedChange={(value) => store.setChecked(value === true)}
            />

            <span>{t("LegalUpdateView.acceptance")}</span>
          </Label>
        ) : null}

        {!status.isSystemAdministrator ? (
          <p className="text-sm text-subdued">{t("LegalUpdateView.memberWaiting")}</p>
        ) : null}
      </AppCardBody>

      <AppCardFooter>
        {!status.isSystemAdministrator ? (
          <Button disabled={loadingOverlayStore.isLoading} variant="outline" onClick={() => window.location.reload()}>
            {t("LegalUpdateView.retry")}
          </Button>
        ) : null}

        {status.isSystemAdministrator ? (
          <Button disabled={!store.checked || loadingOverlayStore.isLoading} onClick={() => void store.accept()}>
            {t("LegalUpdateView.accept")}
          </Button>
        ) : null}
      </AppCardFooter>
    </AppCard>
  );
});
