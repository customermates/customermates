"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";

import { AppLink } from "@/components/shared/app-link";
import { Button } from "@/components/ui/button";
import { Popover, PopoverAnchor, PopoverContent } from "@/components/ui/popover";
import { reportApplicationError, runUserAction } from "@/core/errors/report-application-error";
import {
  captureConsentedGoogleAdsClickAction,
  decidePublicGoogleAdsConsentAction,
  readPublicGoogleAdsConsentAction,
  reconcileGoogleAdsAttributionWithdrawalAction,
} from "@/features/acquisition/google-ads-consent.actions";
import { normalizeGoogleAdsClick } from "@/features/acquisition/google-ads-consent.schema";
import { OPEN_PRIVACY_CHOICES_EVENT } from "./privacy-choices-event";

function currentVisit() {
  return { search: window.location.search };
}

export function PublicGoogleAdsConsent() {
  const t = useTranslations();
  const [open, setOpen] = useState(false);
  const [isPending, setIsPending] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const hydrate = async () => {
      const stored = await readPublicGoogleAdsConsentAction();
      if (cancelled) return;
      const visit = currentVisit();
      if (stored?.advertising) await captureConsentedGoogleAdsClickAction(visit);
      else if (stored) await reconcileGoogleAdsAttributionWithdrawalAction();
      else if (stored === null && normalizeGoogleAdsClick(visit)) setOpen(true);
    };
    void hydrate().catch((error) => {
      reportApplicationError(error);
      if (!cancelled && normalizeGoogleAdsClick(currentVisit())) setOpen(true);
    });

    const reopen = () => setOpen(true);
    window.addEventListener(OPEN_PRIVACY_CHOICES_EVENT, reopen);
    return () => {
      cancelled = true;
      window.removeEventListener(OPEN_PRIVACY_CHOICES_EVENT, reopen);
    };
  }, []);

  const decide = async (choice: "allow-attribution" | "necessary-only") => {
    if (isPending) return;
    setIsPending(true);
    try {
      const decision = await decidePublicGoogleAdsConsentAction({
        choice,
        visit: currentVisit(),
      });
      if (!decision) return;
      setOpen(false);
      if (!decision.advertising) void reconcileGoogleAdsAttributionWithdrawalAction().catch(reportApplicationError);
    } finally {
      setIsPending(false);
    }
  };

  return (
    <Popover open={open} onOpenChange={() => undefined}>
      <PopoverAnchor asChild>
        <span
          aria-hidden="true"
          className="pointer-events-none fixed size-px"
          style={{
            bottom: "calc(var(--viewport-gutter) + var(--safe-bottom))",
            left: "calc(var(--viewport-gutter) + var(--safe-left))",
          }}
        />
      </PopoverAnchor>

      <PopoverContent
        align="start"
        aria-busy={isPending}
        aria-describedby="google-ads-consent-description"
        aria-labelledby="google-ads-consent-title"
        aria-live="polite"
        className="flex w-[min(28rem,calc(100dvw-var(--viewport-gutter)-var(--viewport-gutter)-var(--safe-left)-var(--safe-right)))] flex-col gap-4 rounded-card bg-card p-5 text-card-foreground shadow-lg"
        data-testid="google-ads-consent-card"
        role="dialog"
        side="top"
        sideOffset={0}
        onEscapeKeyDown={(event) => event.preventDefault()}
        onInteractOutside={(event) => event.preventDefault()}
      >
        <div className="space-y-2">
          <h2 className="text-sm font-semibold text-foreground" id="google-ads-consent-title">
            {t("AcquisitionConsent.title")}
          </h2>

          <p className="text-sm leading-6 text-subdued" id="google-ads-consent-description">
            <span>{t("AcquisitionConsent.description")} </span>

            <AppLink appearance="inline" href="/privacy" onClick={() => setOpen(false)}>
              {t("AcquisitionConsent.privacyLink")}
            </AppLink>
          </p>
        </div>

        <div className="grid grid-cols-1 gap-2">
          <Button
            className="w-full"
            disabled={isPending}
            onClick={() => runUserAction(() => decide("allow-attribution"))}
          >
            {t("AcquisitionConsent.allowAttribution")}
          </Button>

          <Button
            className="w-full"
            disabled={isPending}
            variant="secondary"
            onClick={() => runUserAction(() => decide("necessary-only"))}
          >
            {t("AcquisitionConsent.necessaryOnly")}
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}
