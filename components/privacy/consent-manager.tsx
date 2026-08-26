"use client";

import type { AppMode } from "@/core/config/environment";
import type { ConsentState } from "@/core/privacy/consent";

import { useTranslations } from "next-intl";
import dynamic from "next/dynamic";
import { useState } from "react";

import { AppLink } from "@/components/shared/app-link";
import { Button } from "@/components/ui/button";
import { runUserAction } from "@/core/errors/report-application-error";
import { consentCookie } from "@/core/privacy/consent";
import { reloadAfterConsentWithdrawal } from "@/core/privacy/reload";
import { consentTagPolicy } from "@/core/privacy/tag-policy";

type Props = {
  appMode: AppMode;
  initialConsent: ConsentState | null;
};

const Analytics = dynamic(() => import("@vercel/analytics/next").then((module) => module.Analytics), { ssr: false });

export function ConsentManager({ appMode, initialConsent }: Props) {
  const t = useTranslations();
  const [consent, setConsent] = useState<ConsentState | null>(initialConsent);
  const [editing, setEditing] = useState(initialConsent === null);
  const [analytics, setAnalytics] = useState(initialConsent?.analytics ?? false);
  const tags = consentTagPolicy(consent, appMode);
  if (appMode !== "cloud") return null;

  const save = (analyticsAllowed: boolean) => {
    const state: ConsentState = {
      advertising: false,
      analytics: analyticsAllowed,
      decidedAt: new Date().toISOString(),
      version: 1,
    };
    const withdrawsLoadedTag = consent?.analytics === true && !state.analytics;
    document.cookie = consentCookie(state, window.location.protocol === "https:");
    setConsent(state);
    setAnalytics(state.analytics);
    setEditing(false);
    if (withdrawsLoadedTag) reloadAfterConsentWithdrawal();
  };

  return (
    <>
      {tags.analytics ? <Analytics /> : null}

      {editing ? (
        <section
          aria-label={t("ConsentManager.title")}
          className="bg-background border-border fixed inset-x-3 bottom-3 z-[100] mx-auto max-w-3xl rounded-xl border p-4 shadow-2xl sm:p-5"
        >
          <div className="space-y-3">
            <div>
              <h2 className="text-base font-semibold">{t("ConsentManager.title")}</h2>

              <p className="text-sm text-subdued">
                {t.rich("ConsentManager.description", {
                  privacyLink: (chunks) => (
                    <AppLink inheritSize appearance="inline" href="/privacy">
                      {chunks}
                    </AppLink>
                  ),
                })}
              </p>
            </div>

            <div className="grid gap-2">
              <div className="border-border flex gap-3 rounded-lg border p-3">
                <input
                  aria-describedby="consent-analytics-description"
                  aria-labelledby="consent-analytics-title"
                  checked={analytics}
                  className="mt-1 size-4"
                  id="consent-analytics"
                  type="checkbox"
                  onChange={(event) => setAnalytics(event.target.checked)}
                />

                <span>
                  <label
                    className="block cursor-pointer text-sm font-medium"
                    htmlFor="consent-analytics"
                    id="consent-analytics-title"
                  >
                    {t("ConsentManager.analyticsTitle")}
                  </label>

                  <span className="block text-xs text-subdued" id="consent-analytics-description">
                    {t("ConsentManager.analyticsDescription")}
                  </span>
                </span>
              </div>
            </div>

            <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <Button variant="ghost" onClick={() => runUserAction(() => save(false))}>
                {t("ConsentManager.reject")}
              </Button>

              <Button variant="secondary" onClick={() => runUserAction(() => save(analytics))}>
                {t("ConsentManager.save")}
              </Button>

              <Button onClick={() => runUserAction(() => save(true))}>{t("ConsentManager.accept")}</Button>
            </div>
          </div>
        </section>
      ) : (
        <Button className="fixed bottom-3 left-3 z-[90]" size="sm" variant="secondary" onClick={() => setEditing(true)}>
          {t("ConsentManager.manage")}
        </Button>
      )}
    </>
  );
}
