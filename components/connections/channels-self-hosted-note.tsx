"use client";

import { Cable } from "lucide-react";
import { useTranslations } from "next-intl";

import { PageState } from "@/components/page-state/page-state";

export function ChannelsSelfHostedNote() {
  const t = useTranslations();

  return (
    <div data-connection-tab="channels">
      <PageState
        description={t("Connections.channels.selfHostedBody")}
        icon={Cable}
        state="empty"
        title={t("Connections.channels.selfHostedTitle")}
      />
    </div>
  );
}
