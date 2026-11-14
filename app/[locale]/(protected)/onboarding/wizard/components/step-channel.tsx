"use client";

import type { ConnectChannel } from "@/ee/messaging/connect/connect-channels";
import type { MessagingProvider } from "@/generated/prisma";

import { useEffect } from "react";
import { observer } from "mobx-react-lite";
import { useTranslations } from "next-intl";
import { ArrowRight, CircleCheck } from "lucide-react";

import { AppCardFooter } from "@/components/card/app-card-footer";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { reportApplicationError, runUserAction } from "@/core/errors/report-application-error";
import { useRootStore } from "@/core/stores/root-store.provider";
import { getProviderIcon } from "@/ee/messaging/provider-icon";

import { orderedEmailChannels } from "./channel-suggestions";
import { WIZARD_FOOTER_CLASS, WIZARD_FOOTER_GROUP_CLASS } from "./wizard-footer";

type EmailChannel = { key: ConnectChannel; icon: MessagingProvider; label: string };

export const StepChannel = observer(({ email }: { email: string }) => {
  const t = useTranslations();
  const { onboardingWizardStore: store, connectedAccountsStore } = useRootStore();
  const disabled = store.isSubmitting || store.isSaving || store.isInitializing;
  const LinkedInIcon = getProviderIcon("linkedin");
  const connected = connectedAccountsStore.items.filter((account) => account.isOwner);
  const linkedinFirst = store.connectsAgent;
  const labels: Record<"google" | "outlook" | "imap", EmailChannel> = {
    google: { key: "google", icon: "google", label: t("Common.providers.google") },
    outlook: { key: "outlook", icon: "outlook", label: t("Common.providers.outlook") },
    imap: { key: "imap", icon: "mail", label: t("OnboardingWizard.goal.channelsHint.otherEmail") },
  };
  const emailChannels = orderedEmailChannels(email).map((key) => labels[key]);
  const connect = (channel: ConnectChannel) => runUserAction(() => store.connectChannel(channel));

  useEffect(() => {
    void connectedAccountsStore.ensureLoaded().catch(reportApplicationError);
  }, [connectedAccountsStore]);

  const linkedin = (
    <div
      key="linkedin"
      className="flex flex-col gap-3 rounded-lg border border-border p-4 sm:flex-row sm:items-center"
      data-primary={linkedinFirst || undefined}
    >
      <LinkedInIcon aria-hidden="true" className="size-8 shrink-0" />

      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <div className="flex flex-wrap items-center gap-2">
          <p className="text-sm font-medium">{t("OnboardingWizard.goal.channelsHint.linkedinTitle")}</p>

          {linkedinFirst ? <Badge>{t("OnboardingWizard.goal.channelsHint.recommended")}</Badge> : null}
        </div>

        <p className="text-xs text-muted-foreground">{t("OnboardingWizard.goal.channelsHint.linkedinDescription")}</p>
      </div>

      <Button
        className="shrink-0"
        disabled={disabled}
        id="onboarding-channel-linkedin"
        type="button"
        variant={linkedinFirst ? "default" : "secondary"}
        onClick={() => connect("linkedin")}
      >
        {t("OnboardingWizard.goal.channelsHint.linkedinAction")}
      </Button>
    </div>
  );

  const mailbox = (
    <div
      key="email"
      className="flex flex-col gap-3 rounded-lg border border-border p-4"
      data-primary={!linkedinFirst || undefined}
    >
      <div className="flex flex-col gap-1">
        <div className="flex flex-wrap items-center gap-2">
          <p className="text-sm font-medium">{t("OnboardingWizard.channel.emailTitle")}</p>

          {linkedinFirst ? null : <Badge>{t("OnboardingWizard.goal.channelsHint.recommended")}</Badge>}
        </div>

        <p className="text-xs text-muted-foreground">{t("OnboardingWizard.channel.emailDescription")}</p>
      </div>

      <div className="flex flex-wrap gap-2">
        {emailChannels.map((channel, index) => {
          const ChannelIcon = getProviderIcon(channel.icon);
          return (
            <Button
              key={channel.key}
              disabled={disabled}
              id={`onboarding-channel-${channel.key}`}
              size="sm"
              type="button"
              variant={!linkedinFirst && index === 0 ? "default" : "secondary"}
              onClick={() => connect(channel.key)}
            >
              <ChannelIcon aria-hidden="true" className="size-4" />

              {channel.label}
            </Button>
          );
        })}
      </div>
    </div>
  );

  return (
    <div className="flex flex-col gap-3">
      {connected.length > 0 ? (
        <ul
          aria-label={t("OnboardingWizard.channel.connectedLabel")}
          className="flex flex-col gap-2"
          id="onboarding-channel-connected"
        >
          {connected.map((account) => {
            const AccountIcon = getProviderIcon(account.provider);
            return (
              <li
                key={account.id}
                className="flex items-center gap-2 rounded-lg border border-success/40 bg-success/5 px-3 py-2 text-sm"
              >
                <CircleCheck aria-hidden="true" className="size-4 shrink-0 text-success" />

                <AccountIcon aria-hidden="true" className="size-4 shrink-0" />

                <span className="min-w-0 truncate font-medium">
                  {account.displayName ?? account.emailAddress ?? t("OnboardingWizard.channel.connected")}
                </span>

                <span className="ml-auto shrink-0 text-xs text-muted-foreground">
                  {t("OnboardingWizard.channel.connected")}
                </span>
              </li>
            );
          })}
        </ul>
      ) : null}

      {connected.length > 0 ? (
        <p className="text-xs font-medium text-muted-foreground">{t("OnboardingWizard.channel.addAnother")}</p>
      ) : null}

      {linkedinFirst ? [linkedin, mailbox] : [mailbox, linkedin]}

      <p className="text-xs text-muted-foreground">{t("OnboardingWizard.channel.later")}</p>
    </div>
  );
});

export const StepChannelFooter = observer(() => {
  const t = useTranslations();
  const { onboardingWizardStore: store, connectedAccountsStore } = useRootStore();
  const disabled = store.isSubmitting || store.isSaving || store.isInitializing;
  const hasChannel = connectedAccountsStore.items.some((account) => account.isOwner);

  return (
    <AppCardFooter className={WIZARD_FOOTER_CLASS}>
      <Button
        disabled={disabled || store.isFirstStep}
        id="onboarding-channel-back"
        type="button"
        variant="ghost"
        onClick={() => runUserAction(store.back)}
      >
        {t("Common.actions.back")}
      </Button>

      <div className={`${WIZARD_FOOTER_GROUP_CLASS} justify-end`}>
        {hasChannel ? null : (
          <Button
            disabled={disabled}
            id="onboarding-channel-skip"
            type="button"
            variant="secondary"
            onClick={() => runUserAction(() => store.leaveChannelStep(true))}
          >
            {t("OnboardingWizard.channel.skip")}
          </Button>
        )}

        <Button
          className="max-sm:disabled:hidden"
          disabled={disabled || !hasChannel}
          id="onboarding-channel-continue"
          type="button"
          onClick={() => runUserAction(() => store.leaveChannelStep(false))}
        >
          {t("OnboardingWizard.continue")}

          <ArrowRight aria-hidden="true" className="size-4" />
        </Button>
      </div>
    </AppCardFooter>
  );
});
