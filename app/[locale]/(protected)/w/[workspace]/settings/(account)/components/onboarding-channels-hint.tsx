"use client";

import type { ConnectChannel } from "@/ee/messaging/connect/connect-channels";
import type { MessagingProvider } from "@/generated/prisma";

import { observer } from "mobx-react-lite";
import { useTranslations } from "next-intl";
import { useSearchParams } from "next/navigation";
import { ArrowRight, CircleCheck } from "lucide-react";
import { Action, Resource } from "@/generated/prisma";

import { Alert } from "@/components/shared/alert";
import { AppLink } from "@/components/shared/app-link";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { runUserAction } from "@/core/errors/report-application-error";
import { useRootStore } from "@/core/stores/root-store.provider";
import { getProviderIcon } from "@/ee/messaging/provider-icon";
import { serverRenderedClient } from "@/core/utils/server-rendered-client";
import { ONBOARDING_ORIGIN_QUERY_PARAM, ONBOARDING_ORIGIN_VALUE } from "@/features/onboarding-funnel/onboarding-job";

import {
  ONBOARDING_CONNECTED_QUERY_PARAM,
  parseConnectChannel,
  rememberOnboardingConnect,
} from "./onboarding-connect-return";

const OnboardingConnectedState = ({ channel }: { channel: ConnectChannel }) => {
  const t = useTranslations();
  const title = channel.startsWith("linkedin")
    ? t("OnboardingWizard.goal.channelsHint.connectedLinkedinTitle")
    : t("OnboardingWizard.goal.channelsHint.connectedEmailTitle");

  return (
    <Alert
      description={t("OnboardingWizard.goal.channelsHint.connectedDescription")}
      icon={<CircleCheck />}
      id="onboarding-channel-connected"
      role="status"
      title={title}
      variant="success"
    >
      <div className="mt-2 flex flex-wrap gap-2">
        <Button asChild size="sm">
          <AppLink href="/dashboard" id="onboarding-open-dashboard">
            {t("OnboardingWizard.goal.channelsHint.action")}

            <ArrowRight aria-hidden="true" className="size-4" />
          </AppLink>
        </Button>

        <Button asChild size="sm" variant="secondary">
          <AppLink href="/inbox" id="onboarding-open-inbox">
            {t("OnboardingWizard.goal.channelsHint.inboxAction")}
          </AppLink>
        </Button>
      </div>
    </Alert>
  );
};

const OnboardingChannelsHintContent = observer(() => {
  const t = useTranslations();
  const searchParams = useSearchParams();
  const { connectedAccountsStore, userStore } = useRootStore();
  const canConnect = userStore.can(Resource.inboxMessages, Action.create);
  const LinkedInIcon = getProviderIcon("linkedin");
  const emailChannels: { key: ConnectChannel; icon: MessagingProvider; label: string }[] = [
    { key: "google", icon: "google", label: t("Common.providers.google") },
    { key: "outlook", icon: "outlook", label: t("Common.providers.outlook") },
    { key: "imap", icon: "mail", label: t("OnboardingWizard.goal.channelsHint.otherEmail") },
  ];
  const connect = (channel: ConnectChannel) =>
    runUserAction(() => {
      rememberOnboardingConnect(channel);
      return connectedAccountsStore.connectAccount(channel);
    });

  if (searchParams.get(ONBOARDING_ORIGIN_QUERY_PARAM) !== ONBOARDING_ORIGIN_VALUE) return null;

  const connectedChannel = parseConnectChannel(searchParams.get(ONBOARDING_CONNECTED_QUERY_PARAM));

  return (
    <Card aria-labelledby="onboarding-channels-title" className="mb-4 w-full max-w-3xl gap-0 py-0" role="region">
      <CardContent className="flex flex-col gap-5 p-5 sm:p-6">
        <div className="flex flex-col gap-1">
          <h2 className="text-lg font-semibold" id="onboarding-channels-title">
            {t("OnboardingWizard.goal.channelsHint.title")}
          </h2>

          <p className="text-sm text-muted-foreground">{t("OnboardingWizard.goal.channelsHint.description")}</p>
        </div>

        {connectedChannel ? (
          <OnboardingConnectedState channel={connectedChannel} />
        ) : canConnect ? (
          <>
            <div className="flex flex-col gap-3 rounded-lg border border-primary/30 bg-primary/5 p-4 sm:flex-row sm:items-center">
              <LinkedInIcon aria-hidden="true" className="size-8 shrink-0" />

              <div className="flex min-w-0 flex-1 flex-col gap-1">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="text-sm font-medium">{t("OnboardingWizard.goal.channelsHint.linkedinTitle")}</p>

                  <Badge variant="default">{t("OnboardingWizard.goal.channelsHint.recommended")}</Badge>
                </div>

                <p className="text-xs text-muted-foreground">
                  {t("OnboardingWizard.goal.channelsHint.linkedinDescription")}
                </p>
              </div>

              <Button
                className="shrink-0"
                id="onboarding-connect-linkedin"
                type="button"
                onClick={() => connect("linkedin")}
              >
                {t("OnboardingWizard.goal.channelsHint.linkedinAction")}
              </Button>
            </div>

            <Button
              className="-mt-2 h-auto max-w-full self-start whitespace-normal px-0 text-left"
              id="onboarding-connect-sales-navigator"
              size="sm"
              type="button"
              variant="link"
              onClick={() => connect("linkedin_sales_navigator")}
            >
              {t("OnboardingWizard.goal.channelsHint.salesNavigator")}
            </Button>

            <div className="flex flex-col gap-2">
              <p className="text-xs font-medium text-muted-foreground">
                {t("OnboardingWizard.goal.channelsHint.emailTitle")}
              </p>

              <div className="flex flex-wrap gap-2">
                {emailChannels.map((channel) => {
                  const ChannelIcon = getProviderIcon(channel.icon);
                  return (
                    <Button
                      key={channel.key}
                      id={`onboarding-connect-${channel.key}`}
                      size="sm"
                      type="button"
                      variant="secondary"
                      onClick={() => connect(channel.key)}
                    >
                      <ChannelIcon aria-hidden="true" className="size-4" />

                      {channel.label}
                    </Button>
                  );
                })}
              </div>
            </div>
          </>
        ) : null}

        <div className="flex flex-wrap items-center justify-between gap-2 border-t pt-4">
          <p className="text-xs text-muted-foreground">{t("OnboardingWizard.goal.channelsHint.later")}</p>

          {connectedChannel ? null : (
            <Button asChild size="sm" variant="ghost">
              <AppLink href="/dashboard">
                {t("OnboardingWizard.goal.channelsHint.action")}

                <ArrowRight aria-hidden="true" className="size-4" />
              </AppLink>
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
});

export const OnboardingChannelsHint = serverRenderedClient(OnboardingChannelsHintContent);
