"use client";

import type { ConnectChannel } from "@/ee/messaging/connect/connect-channels";
import type { MessagingProvider } from "@/generated/prisma";

import { observer } from "mobx-react-lite";
import { useTranslations } from "next-intl";
import { Cable } from "lucide-react";
import { useEffect } from "react";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { connectedChannels } from "@/components/keyboard/connect-intent";
import { useRootStore } from "@/core/stores/root-store.provider";
import { runUserAction } from "@/core/errors/report-application-error";
import { cn } from "@/core/utils/cn";
import { getProviderIcon } from "@/ee/messaging/provider-icon";

export const CONNECT_CHANNEL_OPTIONS: {
  key: ConnectChannel;
  icon: MessagingProvider;
  labelKey: string;
}[] = [
  { key: "google", icon: "google", labelKey: "Common.providers.google" },
  { key: "outlook", icon: "outlook", labelKey: "Common.providers.outlook" },
  {
    key: "imap",
    icon: "mail",
    labelKey: "ConnectedAccountsCard.channels.imap",
  },
  { key: "whatsapp", icon: "whatsapp", labelKey: "Common.providers.whatsapp" },
  {
    key: "linkedin",
    icon: "linkedin",
    labelKey: "ConnectedAccountsCard.channels.linkedinClassic",
  },
  {
    key: "linkedin_sales_navigator",
    icon: "linkedin",
    labelKey: "ConnectedAccountsCard.channels.linkedinSalesNavigator",
  },
  {
    key: "linkedin_recruiter",
    icon: "linkedin",
    labelKey: "ConnectedAccountsCard.channels.linkedinRecruiter",
  },
  {
    key: "instagram",
    icon: "instagram",
    labelKey: "Common.providers.instagram",
  },
  { key: "telegram", icon: "telegram", labelKey: "Common.providers.telegram" },
];

const FEATURED_PROVIDERS: MessagingProvider[] = ["whatsapp", "linkedin", "google"];

export const ConnectProviderStack = ({ onPrimary }: { onPrimary: boolean }) => {
  const overflowCount = new Set(CONNECT_CHANNEL_OPTIONS.map((option) => option.icon)).size - FEATURED_PROVIDERS.length;

  return (
    <span className="-space-x-1.5 flex items-center">
      {FEATURED_PROVIDERS.map((provider) => {
        const ChannelIcon = getProviderIcon(provider);
        return (
          <ChannelIcon
            key={provider}
            className={cn("size-5 rounded-full ring-2", onPrimary ? "ring-primary" : "ring-secondary")}
          />
        );
      })}

      {overflowCount > 0 && (
        <span
          className={cn(
            "flex size-5 items-center justify-center rounded-full text-[10px] font-medium ring-2",
            onPrimary
              ? "bg-primary-foreground text-primary ring-primary"
              : "bg-background text-muted-foreground ring-secondary",
          )}
        >
          +{overflowCount}
        </span>
      )}
    </span>
  );
};

export const ConnectMenuItems = observer(({ channels }: { channels?: readonly ConnectChannel[] }) => {
  const t = useTranslations();
  const { connectedAccountsStore } = useRootStore();
  const connected = connectedChannels(connectedAccountsStore.items);

  return CONNECT_CHANNEL_OPTIONS.filter((option) => !channels || channels.includes(option.key)).map((option) => {
    const ChannelIcon = getProviderIcon(option.icon);
    return (
      <DropdownMenuItem
        key={option.key}
        data-channel-connected={connected.has(option.key) ? "" : undefined}
        onClick={() => runUserAction(() => connectedAccountsStore.connectAccount(option.key))}
      >
        <ChannelIcon className="size-4" />

        {t(option.labelKey)}

        {connected.has(option.key) && (
          <span className="ms-auto ps-3 text-xs text-muted-foreground">{t("ConnectedAccountsCard.connectedNote")}</span>
        )}
      </DropdownMenuItem>
    );
  });
});

export const ConnectChannelButton = observer(
  ({ id, label, channels }: { id: string; label: string; channels?: readonly ConnectChannel[] }) => {
    const { connectedAccountsStore } = useRootStore();
    useEffect(() => {
      void connectedAccountsStore.ensureLoaded().catch(() => undefined);
    }, [connectedAccountsStore]);
    return (
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button className="h-8" id={id} size="sm" variant="secondary">
            <Cable aria-hidden className="size-3.5" />

            {label}
          </Button>
        </DropdownMenuTrigger>

        <DropdownMenuContent align="center" aria-labelledby={id}>
          <ConnectMenuItems channels={channels} />
        </DropdownMenuContent>
      </DropdownMenu>
    );
  },
);
