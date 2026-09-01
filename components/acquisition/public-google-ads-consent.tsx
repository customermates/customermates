"use client";

import { useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { usePathname } from "next/navigation";

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
import {
  PUBLIC_GOOGLE_ADS_PENDING_MAX_AGE_SECONDS,
  hasGoogleAdsPendingMarker,
  normalizeGoogleAdsClick,
  normalizePendingGoogleAdsClick,
  normalizePublicGoogleAdsVisitClick,
  preserveGoogleAdsClickInHref,
  removeGoogleAdsClickFromHref,
} from "@/features/acquisition/google-ads-consent.schema";
import { stripLocalePrefix } from "@/i18n/locale-registry";
import { isContentPathname } from "@/i18n/routing";
import { OPEN_PRIVACY_CHOICES_EVENT } from "./privacy-choices-event";

type GoogleAdsVisit = { pendingAt: string; search: string };

function currentRelativeHref(): string {
  return `${window.location.pathname}${window.location.search}${window.location.hash}`;
}

function replaceCurrentRelativeHref(href: string): void {
  if (href !== currentRelativeHref()) window.history.replaceState(null, "", href);
}

function currentGoogleAdsVisit(): GoogleAdsVisit | null {
  const pathname = window.location.pathname;
  const search = window.location.search;
  const eligibleLanding = isContentPathname(pathname) || stripLocalePrefix(pathname) === "/contact";
  const markedClick = normalizePendingGoogleAdsClick({ search });
  if (hasGoogleAdsPendingMarker({ search }) && !markedClick) return null;
  if (!eligibleLanding && !markedClick) return null;

  const click = markedClick ?? normalizeGoogleAdsClick({ search });
  if (!click) return null;

  const params = new URLSearchParams([[click.kind, click.value]]);
  return { pendingAt: click.capturedAt, search: `?${params.toString()}` };
}

export function PublicGoogleAdsConsent() {
  const t = useTranslations();
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [isPending, setIsPending] = useState(false);
  const allowButton = useRef<HTMLButtonElement>(null);
  const decisionInFlight = useRef(false);
  const hasDecision = useRef(false);
  const pendingVisit = useRef<GoogleAdsVisit | null>(null);

  useEffect(() => {
    let cancelled = false;
    const hadPendingMarker = hasGoogleAdsPendingMarker({ search: window.location.search });
    const landingVisit = currentGoogleAdsVisit();
    if (hadPendingMarker && !landingVisit)
      replaceCurrentRelativeHref(removeGoogleAdsClickFromHref(currentRelativeHref()));
    const hydrate = async () => {
      let stored: Awaited<ReturnType<typeof readPublicGoogleAdsConsentAction>>;
      try {
        stored = await readPublicGoogleAdsConsentAction();
      } catch (error) {
        reportApplicationError(error);
        if (!cancelled && landingVisit) {
          pendingVisit.current = landingVisit;
          setOpen(true);
        }
        return;
      }

      if (cancelled) return;
      if (stored) {
        hasDecision.current = true;
        replaceCurrentRelativeHref(removeGoogleAdsClickFromHref(currentRelativeHref()));
        try {
          if (stored.advertising && landingVisit) await captureConsentedGoogleAdsClickAction(landingVisit);
          else if (!stored.advertising) await reconcileGoogleAdsAttributionWithdrawalAction();
        } catch (error) {
          reportApplicationError(error);
        }
      } else if (landingVisit) {
        pendingVisit.current = landingVisit;
        setOpen(true);
      }
    };
    void hydrate().catch(reportApplicationError);

    const reopen = () => setOpen(true);
    const reconcileNavigatedClick = () => {
      if (hasDecision.current) replaceCurrentRelativeHref(removeGoogleAdsClickFromHref(currentRelativeHref()));
      else if (pendingVisit.current)
        replaceCurrentRelativeHref(preserveGoogleAdsClickInHref(currentRelativeHref(), pendingVisit.current));
    };
    window.addEventListener(OPEN_PRIVACY_CHOICES_EVENT, reopen);
    window.addEventListener("popstate", reconcileNavigatedClick);
    return () => {
      cancelled = true;
      window.removeEventListener(OPEN_PRIVACY_CHOICES_EVENT, reopen);
      window.removeEventListener("popstate", reconcileNavigatedClick);
    };
  }, []);

  useEffect(() => {
    if (hasDecision.current) {
      replaceCurrentRelativeHref(removeGoogleAdsClickFromHref(currentRelativeHref()));
      return;
    }
    if (!open || !pendingVisit.current) return;
    replaceCurrentRelativeHref(preserveGoogleAdsClickInHref(currentRelativeHref(), pendingVisit.current));
  }, [open, pathname]);

  useEffect(() => {
    const visit = pendingVisit.current;
    if (!open || !visit) return;

    const expire = () => {
      pendingVisit.current = null;
      replaceCurrentRelativeHref(removeGoogleAdsClickFromHref(currentRelativeHref()));
      setOpen(false);
    };
    const remainingMilliseconds =
      new Date(visit.pendingAt).getTime() + PUBLIC_GOOGLE_ADS_PENDING_MAX_AGE_SECONDS * 1000 - Date.now();
    if (remainingMilliseconds <= 0) {
      expire();
      return;
    }

    const timeout = window.setTimeout(expire, remainingMilliseconds);
    return () => window.clearTimeout(timeout);
  }, [open, pathname]);

  const decide = async (choice: "allow-attribution" | "necessary-only") => {
    if (decisionInFlight.current) return;
    decisionInFlight.current = true;
    setIsPending(true);
    try {
      const visit = pendingVisit.current ?? currentGoogleAdsVisit();
      if (visit && !normalizePublicGoogleAdsVisitClick(visit)) {
        pendingVisit.current = null;
        replaceCurrentRelativeHref(removeGoogleAdsClickFromHref(currentRelativeHref()));
        setOpen(false);
        return;
      }
      const decision = await decidePublicGoogleAdsConsentAction({
        choice,
        visit,
      });
      if (!decision) return;
      hasDecision.current = true;
      pendingVisit.current = null;
      replaceCurrentRelativeHref(removeGoogleAdsClickFromHref(currentRelativeHref()));
      setOpen(false);
      if (!decision.advertising) void reconcileGoogleAdsAttributionWithdrawalAction().catch(reportApplicationError);
    } finally {
      decisionInFlight.current = false;
      setIsPending(false);
    }
  };

  return (
    <Popover modal open={open} onOpenChange={() => undefined}>
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
        onOpenAutoFocus={() => allowButton.current?.focus()}
      >
        <div className="space-y-2">
          <h2 className="text-sm font-semibold text-foreground" id="google-ads-consent-title">
            {t("AcquisitionConsent.title")}
          </h2>

          <p className="text-sm leading-6 text-subdued" id="google-ads-consent-description">
            <span>{t("AcquisitionConsent.description")} </span>

            <AppLink appearance="inline" href="/privacy">
              {t("AcquisitionConsent.privacyLink")}
            </AppLink>
          </p>
        </div>

        <div className="grid grid-cols-1 gap-2">
          <Button
            ref={allowButton}
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
