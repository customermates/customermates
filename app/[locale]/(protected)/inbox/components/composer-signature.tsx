"use client";

import { observer } from "mobx-react-lite";
import { useTranslations } from "next-intl";

import { IntlLink as Link } from "@/i18n/navigation";
import { useRootStore } from "@/core/stores/root-store.provider";
import { isEmailProvider } from "@/ee/messaging/provider";

import { SanitizedHtml } from "@/components/shared/sanitized-html";

type Props = {
  connectedAccountId: string | null;
};

export const ComposerSignature = observer(({ connectedAccountId }: Props) => {
  const t = useTranslations();
  const { connectedAccountsStore } = useRootStore();

  if (!connectedAccountId) return null;

  const account = connectedAccountsStore.items.find((item) => item.id === connectedAccountId);
  if (!account || !isEmailProvider(account.provider) || !account.signatureHtml) return null;

  return (
    <div className="border-border text-muted-foreground mx-3 mb-2 border-t pt-2 text-xs">
      <div className="flex items-start justify-between gap-2">
        <SanitizedHtml className="[&_a]:underline [&_p]:m-0 [&_p+p]:mt-1" html={account.signatureHtml} />

        <Link className="shrink-0 underline underline-offset-2" href="/profile/connected-accounts">
          {t("Inbox.compose.signatureEdit")}
        </Link>
      </div>
    </div>
  );
});
