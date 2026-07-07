"use client";

import { observer } from "mobx-react-lite";
import { useTranslations } from "next-intl";

import type { MessagingProvider } from "@/generated/prisma";

import { ThreadReplyComposer } from "@/app/[locale]/(protected)/inbox/components/thread-reply-composer";
import { useRootStore } from "@/core/stores/root-store.provider";

type Props = {
  provider: MessagingProvider;
};

export const ContactComposePopover = observer(({ provider }: Props) => {
  const t = useTranslations();
  const { connectedAccountsStore } = useRootStore();

  if (connectedAccountsStore.usableSendersFor(provider).length === 0) {
    return (
      <p className="text-muted-foreground p-4 text-xs">
        {t("EntityChannels.compose.noAccount", { provider: t(`Common.providers.${provider}`) })}
      </p>
    );
  }

  return <ThreadReplyComposer bare provider={provider} />;
});
