"use client";

import type { ReactNode } from "react";
import type { AuthMethod, AuthMethodState } from "./auth-method-state";

import { KeyRound, LockKeyhole, MailCheck, Mail } from "lucide-react";
import { observer } from "mobx-react-lite";
import { useTranslations } from "next-intl";
import { useEffect, useState } from "react";

import { availableAuthMethods } from "./auth-method-state";
import SignInProviderButton from "./sign-in-provider-button";

import { FormInput } from "@/components/forms/form-input";
import { Button } from "@/components/ui/button";
import { SegmentedControl, SegmentedControlPanel } from "@/components/ui/segmented-control";
import { runUserAction } from "@/core/errors/report-application-error";

type SocialProviders = { google: boolean; microsoft: boolean };

type TabsProps = {
  state: AuthMethodState;
  socialProviders: SocialProviders;
  isLoading: boolean;
  providerLabel: (provider: string) => string;
  password: ReactNode;
  onContinueWithProvider: (provider: "google" | "microsoft") => Promise<void>;
};

const METHOD_ICONS = { password: LockKeyhole, sso: KeyRound, magicLink: Mail } as const;

function hasSingleSignOn(socialProviders: SocialProviders): boolean {
  return socialProviders.google || socialProviders.microsoft;
}

function activeAuthMethod(state: AuthMethodState, socialProviders: SocialProviders): AuthMethod {
  return availableAuthMethods(hasSingleSignOn(socialProviders)).includes(state.method) ? state.method : "password";
}

export const AuthMethodTabs = observer(
  ({ state, socialProviders, isLoading, providerLabel, password, onContinueWithProvider }: TabsProps) => {
    const t = useTranslations();
    const hasSso = hasSingleSignOn(socialProviders);
    const methods = availableAuthMethods(hasSso);
    const active = activeAuthMethod(state, socialProviders);
    const labels: Record<AuthMethod, string> = {
      password: t("AuthMethods.tabs.password"),
      sso: t("AuthMethods.tabs.sso"),
      magicLink: t("AuthMethods.tabs.magicLink"),
    };

    useEffect(() => {
      state.restoreMethod(availableAuthMethods(hasSso));
    }, [state, hasSso]);

    return (
      <SegmentedControl
        idPrefix="auth-method"
        items={methods.map((method) => {
          const Icon = METHOD_ICONS[method];
          return {
            value: method,
            label: (
              <>
                <Icon aria-hidden className="me-1.5 inline size-3.5 align-[-2px] max-sm:hidden" />

                {labels[method]}
              </>
            ),
          };
        })}
        label={t("AuthMethods.tabsLabel")}
        value={active}
        onValueChange={state.setMethod}
      >
        <SegmentedControlPanel className="flex flex-col gap-4 pt-1" value="password">
          {password}
        </SegmentedControlPanel>

        {methods.includes("sso") ? (
          <SegmentedControlPanel className="flex flex-col items-center gap-4 pt-1" value="sso">
            {socialProviders.google ? (
              <SignInProviderButton
                isLoading={isLoading}
                label={providerLabel("Google")}
                providerId="google"
                onClick={() => runUserAction(() => onContinueWithProvider("google"))}
              />
            ) : null}

            {socialProviders.microsoft ? (
              <SignInProviderButton
                isLoading={isLoading}
                label={providerLabel("Microsoft")}
                providerId="microsoft"
                onClick={() => runUserAction(() => onContinueWithProvider("microsoft"))}
              />
            ) : null}
          </SegmentedControlPanel>
        ) : null}

        <SegmentedControlPanel className="flex flex-col gap-4 pt-1" value="magicLink">
          {state.magicLinkSentTo ? (
            <div className="flex flex-col items-center gap-2 py-2 text-center" role="status">
              <MailCheck aria-hidden className="size-8 text-primary" />

              <p className="text-x-md font-medium">{t("AuthMethods.magicLink.sentTitle")}</p>

              <p className="text-x-sm text-subdued [overflow-wrap:anywhere]">
                {t("AuthMethods.magicLink.sentBody", { email: state.magicLinkSentTo })}
              </p>
            </div>
          ) : (
            <>
              <FormInput required id="email" type="email" />

              <p className="text-x-xs text-subdued">{t("AuthMethods.magicLink.hint")}</p>
            </>
          )}
        </SegmentedControlPanel>
      </SegmentedControl>
    );
  },
);

type ActionsProps = {
  state: AuthMethodState;
  socialProviders: SocialProviders;
  isLoading: boolean;
  passwordCta: string;
  magicLinkCta: string;
  onResendMagicLink: () => Promise<void>;
};

function useSecondsUntil(timestamp: number): number {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    setNow(Date.now());
    if (timestamp <= Date.now()) return;
    const timer = setInterval(() => {
      const current = Date.now();
      setNow(current);
      if (current >= timestamp) clearInterval(timer);
    }, 1000);
    return () => clearInterval(timer);
  }, [timestamp]);

  return Math.max(0, Math.ceil((timestamp - now) / 1000));
}

export const AuthMethodActions = observer(
  ({ state, socialProviders, isLoading, passwordCta, magicLinkCta, onResendMagicLink }: ActionsProps) => {
    const t = useTranslations();
    const active = activeAuthMethod(state, socialProviders);
    const secondsLeft = useSecondsUntil(state.resendAvailableAt);

    if (active === "sso") return null;

    if (active === "password") {
      return (
        <Button className="w-full" disabled={isLoading} type="submit">
          {passwordCta}
        </Button>
      );
    }

    if (!state.magicLinkSentTo) {
      return (
        <Button className="w-full" disabled={isLoading} type="submit">
          {magicLinkCta}
        </Button>
      );
    }

    return (
      <div className="flex w-full flex-col gap-2">
        <Button
          className="w-full"
          disabled={isLoading || secondsLeft > 0}
          type="button"
          variant="secondary"
          onClick={() => runUserAction(onResendMagicLink)}
        >
          {secondsLeft > 0
            ? t("AuthMethods.magicLink.resendIn", { seconds: secondsLeft })
            : t("AuthMethods.magicLink.resend")}
        </Button>

        <Button className="w-full" disabled={isLoading} type="button" variant="ghost" onClick={state.clearMagicLink}>
          {t("AuthMethods.magicLink.useAnotherEmail")}
        </Button>
      </div>
    );
  },
);
