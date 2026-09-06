"use client";

import { observer } from "mobx-react-lite";

import { useRootStore } from "@/core/stores/root-store.provider";
import { isEmailProvider } from "@/ee/messaging/provider";

import { EmailFrame } from "@/features/messaging/email-frame";

type Props = {
  connectedAccountId: string | null;
};

export const ComposerSignature = observer(({ connectedAccountId }: Props) => {
  const { connectedAccountsStore } = useRootStore();

  if (!connectedAccountId) return null;

  const account = connectedAccountsStore.items.find((item) => item.id === connectedAccountId);
  if (!account || !isEmailProvider(account.provider) || !account.signatureHtml) return null;

  return (
    <div className="mx-3 mt-1.5 mb-2 overflow-x-auto">
      <EmailFrame html={account.signatureHtml} presentation="composer" showRemoteImages={account.isOwner} />
    </div>
  );
});
