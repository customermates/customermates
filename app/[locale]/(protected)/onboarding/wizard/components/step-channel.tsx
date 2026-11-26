"use client";

import type { ConnectChannel } from "@/ee/messaging/connect/connect-channels";
import type { MessagingProvider } from "@/generated/prisma";

import { useEffect, useState } from "react";
import { observer } from "mobx-react-lite";
import { useTranslations } from "next-intl";
import { useSearchParams } from "next/navigation";
import { ArrowRight, CircleCheck, Loader2 } from "lucide-react";

import { AppCardFooter } from "@/components/card/app-card-footer";
import { SelectableCard } from "@/components/forms/selectable-card";
import { LogoStack } from "@/components/shared/logo-stack";
import { SettingsPanelLogo } from "@/components/shared/settings-panel";
import { RadioGroup } from "@/components/ui/radio-group";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { reportApplicationError, runUserAction } from "@/core/errors/report-application-error";
import { useRootStore } from "@/core/stores/root-store.provider";
import { getProviderIcon } from "@/ee/messaging/provider-icon";
import { CONNECT_CHANNEL_KEYS, ONBOARDING_CHANNEL_RETURN_PARAM } from "@/ee/messaging/connect/connect-channels";

function parseConnectReturn(value: string | null): ConnectChannel | null {
  return CONNECT_CHANNEL_KEYS.find((key) => key === value) ?? null;
}

import { orderedEmailChannels } from "./channel-suggestions";
import { WIZARD_FOOTER_CLASS, WIZARD_FOOTER_GROUP_CLASS } from "./wizard-footer";

type ChannelRow = { key: ConnectChannel; icon: MessagingProvider; label: string; caption: string };

const LINKEDIN_PLANS = ["linkedin", "linkedin_sales_navigator", "linkedin_recruiter"] as const;
type LinkedinPlan = (typeof LINKEDIN_PLANS)[number];

const LinkedinPlanPicker = ({
  value,
  disabled,
  onChange,
}: {
  value: LinkedinPlan;
  disabled: boolean;
  onChange: (plan: LinkedinPlan) => void;
}) => {
  const t = useTranslations();
  const plans: Record<LinkedinPlan, { label: string; hint: string }> = {
    linkedin: {
      label: t("ConnectedAccountsCard.channels.linkedinClassic"),
      hint: t("OnboardingWizard.channel.linkedinPlan.hint.linkedin"),
    },
    linkedin_sales_navigator: {
      label: t("ConnectedAccountsCard.channels.linkedinSalesNavigator"),
      hint: t("OnboardingWizard.channel.linkedinPlan.hint.linkedin_sales_navigator"),
    },
    linkedin_recruiter: {
      label: t("ConnectedAccountsCard.channels.linkedinRecruiter"),
      hint: t("OnboardingWizard.channel.linkedinPlan.hint.linkedin_recruiter"),
    },
  };

  return (
    <div className="flex flex-col gap-2">
      <span className="text-xs font-medium text-foreground" id="onboarding-linkedin-plan-label">
        {t("OnboardingWizard.channel.linkedinPlan.label")}
      </span>

      <RadioGroup
        aria-labelledby="onboarding-linkedin-plan-label"
        className="grid grid-cols-1 gap-2 sm:grid-cols-3"
        disabled={disabled}
        id="onboarding-linkedin-plan"
        value={value}
        onValueChange={(next) => onChange(LINKEDIN_PLANS.find((plan) => plan === next) ?? "linkedin")}
      >
        {LINKEDIN_PLANS.map((plan) => (
          <SelectableCard
            key={plan}
            description={plans[plan].hint}
            disabled={disabled}
            id={`onboarding-linkedin-plan-${plan}`}
            label={plans[plan].label}
            selectionMode="single"
            value={plan}
          />
        ))}
      </RadioGroup>
    </div>
  );
};

const ChannelRowItem = ({
  row,
  primary,
  disabled,
  onConnect,
}: {
  row: ChannelRow;
  primary: boolean;
  disabled: boolean;
  onConnect: (channel: ConnectChannel) => void;
}) => {
  const t = useTranslations();
  const [plan, setPlan] = useState<LinkedinPlan>("linkedin");
  const Icon = getProviderIcon(row.icon);
  const isLinkedin = row.key === "linkedin";

  return (
    <li className="flex flex-col gap-3 border-b px-4 py-3 last:border-b-0" data-primary={primary || undefined}>
      <div className="flex items-center gap-3">
        <SettingsPanelLogo>
          <Icon aria-hidden="true" className="size-5" />
        </SettingsPanelLogo>

        <div className="flex min-w-0 flex-1 flex-col">
          <span className="flex flex-wrap items-center gap-2">
            <span className="text-sm font-medium">{row.label}</span>

            {primary ? <Badge>{t("OnboardingWizard.goal.channelsHint.recommended")}</Badge> : null}
          </span>

          <span className="text-xs text-muted-foreground">{row.caption}</span>
        </div>

        <Button
          aria-label={t("OnboardingWizard.channel.connectNamed", { channel: row.label })}
          className="shrink-0"
          disabled={disabled}
          id={`onboarding-channel-${row.key}`}
          size="sm"
          type="button"
          variant={primary ? "default" : "secondary"}
          onClick={() => onConnect(isLinkedin ? plan : row.key)}
        >
          {t("OnboardingWizard.channel.connect")}
        </Button>
      </div>

      {isLinkedin ? <LinkedinPlanPicker disabled={disabled} value={plan} onChange={setPlan} /> : null}
    </li>
  );
};

export const StepChannel = observer(({ email }: { email: string }) => {
  const t = useTranslations();
  const { onboardingWizardStore: store, connectedAccountsStore } = useRootStore();
  const disabled = store.isSubmitting || store.isSaving || store.isInitializing;
  const connected = connectedAccountsStore.items.filter((account) => account.isOwner);
  const linkedinFirst = store.steps.includes("handoff");
  const labels: Record<"google" | "outlook" | "imap", ChannelRow> = {
    google: {
      key: "google",
      icon: "google",
      label: t("Common.providers.google"),
      caption: t("OnboardingWizard.channel.captions.google"),
    },
    outlook: {
      key: "outlook",
      icon: "outlook",
      label: t("Common.providers.outlook"),
      caption: t("OnboardingWizard.channel.captions.outlook"),
    },
    imap: {
      key: "imap",
      icon: "mail",
      label: t("OnboardingWizard.goal.channelsHint.otherEmail"),
      caption: t("OnboardingWizard.channel.captions.imap"),
    },
  };
  const emailChannels: ChannelRow[] = orderedEmailChannels(email).map((key) => labels[key]);
  const connect = (channel: ConnectChannel) => runUserAction(() => store.connectChannel(channel));

  const returnedFrom = parseConnectReturn(useSearchParams().get(ONBOARDING_CHANNEL_RETURN_PARAM));
  const finishing = returnedFrom !== null && connected.length === 0;

  useEffect(() => {
    void connectedAccountsStore.ensureLoaded().catch(reportApplicationError);
  }, [connectedAccountsStore]);

  useEffect(() => {
    if (!returnedFrom) return;
    connectedAccountsStore.startSyncPolling();
    return () => connectedAccountsStore.stopSyncPolling();
  }, [connectedAccountsStore, returnedFrom]);

  const rows: ChannelRow[] = [...emailChannels];
  const linkedinRow: ChannelRow = {
    key: "linkedin",
    icon: "linkedin",
    label: t("OnboardingWizard.goal.channelsHint.linkedinTitle"),
    caption: t("OnboardingWizard.channel.captions.linkedin"),
  };
  rows.splice(linkedinFirst ? 0 : 2, 0, linkedinRow);

  return (
    <div className="flex flex-col gap-3">
      {finishing ? (
        <p
          className="flex items-center gap-2 rounded-lg border border-dashed border-border bg-muted/30 p-3 text-sm text-muted-foreground"
          id="onboarding-channel-finishing"
          role="status"
        >
          <Loader2 aria-hidden="true" className="size-4 shrink-0 animate-spin motion-reduce:animate-none" />

          {t("OnboardingWizard.channel.finishing")}
        </p>
      ) : null}

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

      <ul
        aria-label={t("OnboardingWizard.channel.optionsLabel")}
        className="flex flex-col overflow-hidden rounded-xl border bg-card shadow-xs"
      >
        {rows.map((row, index) => (
          <ChannelRowItem key={row.key} disabled={disabled} primary={index === 0} row={row} onConnect={connect} />
        ))}
      </ul>

      <div className="flex items-center gap-2">
        <LogoStack
          items={(["whatsapp", "telegram", "instagram", "facebook"] as const).map((provider) => {
            const Icon = getProviderIcon(provider);
            return { key: provider, node: <Icon /> };
          })}
          size="sm"
        />

        <p className="text-xs text-muted-foreground">{t("OnboardingWizard.channel.later")}</p>
      </div>
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
      {store.isFirstStep ? (
        <span />
      ) : (
        <Button
          className="min-h-11"
          disabled={disabled}
          id="onboarding-channel-back"
          type="button"
          variant="ghost"
          onClick={() => runUserAction(store.back)}
        >
          {t("Common.actions.back")}
        </Button>
      )}

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
          {store.isLastStep ? t("OnboardingWizard.finish") : t("OnboardingWizard.continue")}

          <ArrowRight aria-hidden="true" className="size-4" />
        </Button>
      </div>
    </AppCardFooter>
  );
});
