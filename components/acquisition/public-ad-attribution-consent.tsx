"use client";

import { useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { usePathname } from "next/navigation";

import { AppLink } from "@/components/shared/app-link";
import { Button } from "@/components/ui/button";
import { Popover, PopoverAnchor, PopoverContent } from "@/components/ui/popover";
import { reportApplicationError, runUserAction } from "@/core/errors/report-application-error";
import {
  captureConsentedAdClickAction,
  decidePublicAdAttributionConsentAction,
  readPublicAdAttributionConsentAction,
  reconcileAdAttributionWithdrawalAction,
} from "@/features/acquisition/ad-attribution.actions";
import {
  adClickRetentionDays,
  adProviderDisplayName,
  type AdProvider,
} from "@/features/acquisition/ad-provider-registry";
import {
  PUBLIC_AD_ATTRIBUTION_PENDING_MAX_AGE_SECONDS,
  hasAdAttributionPendingMarker,
  normalizeAdClick,
  normalizePendingAdClick,
  normalizePublicAdVisitClick,
  preserveAdClickInHref,
  removeAdClickFromHref,
} from "@/features/acquisition/ad-attribution.schema";
import { stripLocalePrefix } from "@/i18n/locale-registry";
import { isContentPathname } from "@/i18n/routing";
import { OPEN_PRIVACY_CHOICES_EVENT } from "./privacy-choices-event";

type AdAttributionVisit = { pendingAt: string; search: string; provider: AdProvider };

function currentRelativeHref(): string {
  return `${window.location.pathname}${window.location.search}${window.location.hash}`;
}

function replaceCurrentRelativeHref(href: string): void {
  if (href !== currentRelativeHref()) window.history.replaceState(null, "", href);
}

function currentAdAttributionVisit(): AdAttributionVisit | null {
  const pathname = window.location.pathname;
  const search = window.location.search;
  const eligibleLanding = isContentPathname(pathname) || stripLocalePrefix(pathname) === "/contact";
  const markedClick = normalizePendingAdClick({ search });
  if (hasAdAttributionPendingMarker({ search }) && !markedClick) return null;
  if (!eligibleLanding && !markedClick) return null;

  const click = markedClick ?? normalizeAdClick({ search });
  if (!click) return null;

  const params = new URLSearchParams([[click.kind, click.value]]);
  return { pendingAt: click.clickedAt, search: `?${params.toString()}`, provider: click.provider };
}

export function PublicAdAttributionConsentCard() {
  const t = useTranslations();
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [isPending, setIsPending] = useState(false);
  const [provider, setProvider] = useState<AdProvider | null>(null);
  const decisionInFlight = useRef(false);
  const hasDecision = useRef(false);
  const pendingVisit = useRef<AdAttributionVisit | null>(null);

  useEffect(() => {
    let cancelled = false;
    const hadPendingMarker = hasAdAttributionPendingMarker({ search: window.location.search });
    const landingVisit = currentAdAttributionVisit();
    if (hadPendingMarker && !landingVisit) replaceCurrentRelativeHref(removeAdClickFromHref(currentRelativeHref()));
    const hydrate = async () => {
      let stored: Awaited<ReturnType<typeof readPublicAdAttributionConsentAction>>;
      try {
        stored = await readPublicAdAttributionConsentAction();
      } catch (error) {
        reportApplicationError(error);
        if (!cancelled && landingVisit) {
          pendingVisit.current = landingVisit;
          setProvider(landingVisit.provider);
          setOpen(true);
        }
        return;
      }

      if (cancelled) return;
      if (stored) {
        hasDecision.current = true;
        replaceCurrentRelativeHref(removeAdClickFromHref(currentRelativeHref()));
        try {
          if (stored.advertising && landingVisit) await captureConsentedAdClickAction(landingVisit);
          else if (!stored.advertising) await reconcileAdAttributionWithdrawalAction();
        } catch (error) {
          reportApplicationError(error);
        }
      } else if (landingVisit) {
        pendingVisit.current = landingVisit;
        setProvider(landingVisit.provider);
        setOpen(true);
      }
    };
    void hydrate().catch(reportApplicationError);

    const reopen = () => setOpen(true);
    const reconcileNavigatedClick = () => {
      if (hasDecision.current) replaceCurrentRelativeHref(removeAdClickFromHref(currentRelativeHref()));
      else if (pendingVisit.current)
        replaceCurrentRelativeHref(preserveAdClickInHref(currentRelativeHref(), pendingVisit.current));
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
      replaceCurrentRelativeHref(removeAdClickFromHref(currentRelativeHref()));
      return;
    }
    if (!open || !pendingVisit.current) return;
    replaceCurrentRelativeHref(preserveAdClickInHref(currentRelativeHref(), pendingVisit.current));
  }, [open, pathname]);

  useEffect(() => {
    const visit = pendingVisit.current;
    if (!open || !visit) return;

    const expire = () => {
      pendingVisit.current = null;
      replaceCurrentRelativeHref(removeAdClickFromHref(currentRelativeHref()));
      setOpen(false);
    };
    const remainingMilliseconds =
      new Date(visit.pendingAt).getTime() + PUBLIC_AD_ATTRIBUTION_PENDING_MAX_AGE_SECONDS * 1000 - Date.now();
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
      const visit = pendingVisit.current ?? currentAdAttributionVisit();
      if (visit && !normalizePublicAdVisitClick(visit)) {
        pendingVisit.current = null;
        replaceCurrentRelativeHref(removeAdClickFromHref(currentRelativeHref()));
        setOpen(false);
        return;
      }
      const decision = await decidePublicAdAttributionConsentAction({
        choice,
        visit: visit ? { pendingAt: visit.pendingAt, search: visit.search } : null,
      });
      if (!decision) return;
      hasDecision.current = true;
      pendingVisit.current = null;
      replaceCurrentRelativeHref(removeAdClickFromHref(currentRelativeHref()));
      setOpen(false);
      if (!decision.advertising) void reconcileAdAttributionWithdrawalAction().catch(reportApplicationError);
    } finally {
      decisionInFlight.current = false;
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
            left: "50%",
          }}
        />
      </PopoverAnchor>

      <PopoverContent
        align="center"
        aria-busy={isPending}
        aria-describedby="ad-attribution-consent-description"
        aria-labelledby="ad-attribution-consent-title"
        aria-live="polite"
        className="flex w-[min(28rem,calc(100dvw-var(--viewport-gutter)-var(--viewport-gutter)-var(--safe-left)-var(--safe-right)))] flex-col gap-4 rounded-card bg-card p-5 text-card-foreground shadow-lg"
        data-testid="ad-attribution-consent-card"
        role="dialog"
        side="top"
        sideOffset={0}
        onEscapeKeyDown={(event) => event.preventDefault()}
        onInteractOutside={(event) => event.preventDefault()}
        onOpenAutoFocus={(event) => event.preventDefault()}
      >
        <div className="space-y-2">
          <h2 className="text-sm font-semibold text-foreground" id="ad-attribution-consent-title">
            {t("AcquisitionConsent.title")}
          </h2>

          <p className="text-sm leading-6 text-subdued" id="ad-attribution-consent-description">
            <span>
              {provider
                ? t("AcquisitionConsent.description", {
                    provider: adProviderDisplayName(provider),
                    days: adClickRetentionDays(provider),
                  })
                : t("AcquisitionConsent.descriptionGeneric")}{" "}
            </span>

            <AppLink appearance="inline" href="/privacy">
              {t("AcquisitionConsent.privacyLink")}
            </AppLink>
          </p>
        </div>

        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          <Button
            className="w-full"
            disabled={isPending}
            size="lg"
            onClick={() => runUserAction(() => decide("allow-attribution"))}
          >
            {t("AcquisitionConsent.allowAttribution")}
          </Button>

          <Button
            className="w-full"
            disabled={isPending}
            size="lg"
            onClick={() => runUserAction(() => decide("necessary-only"))}
          >
            {t("AcquisitionConsent.necessaryOnly")}
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}
