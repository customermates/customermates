"use client";

import type { WikiProposalsStore } from "./wiki-proposals.store";

import { observer } from "mobx-react-lite";
import { Inbox } from "lucide-react";
import { useTranslations } from "next-intl";

import { TopBarPrimaryButton } from "@/components/shared/top-bar-action-buttons";

export const WikiProposalsEntry = observer(({ store }: { store: WikiProposalsStore }) => {
  const t = useTranslations();

  if (store.total === 0) return null;

  return (
    <TopBarPrimaryButton
      anchorId="wiki-proposals-entry"
      count={store.total}
      icon={Inbox}
      label={t("Wiki.proposals.entry")}
      onClick={() => store.setOpen(true)}
    />
  );
});
