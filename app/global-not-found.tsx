import "@/styles/site";

import { getLocale, getMessages } from "next-intl/server";

import { MarketingShell } from "./components/navigation/marketing-shell";
import { RootDocument } from "./root-document";

import { marketingAccountOf } from "@/features/auth/marketing-account";
import { resolveRequestAccountState } from "@/features/auth/next/resolve-account-state";
import { NotFoundPageView } from "@/components/shared/not-found-page-view";

export default async function GlobalNotFoundPage() {
  const [account, displayLanguage, messages] = await Promise.all([
    resolveRequestAccountState(),
    getLocale(),
    getMessages(),
  ]);

  return (
    <RootDocument displayLanguage={displayLanguage} messages={messages}>
      <MarketingShell account={marketingAccountOf(account)}>
        <NotFoundPageView variant="marketing" />
      </MarketingShell>
    </RootDocument>
  );
}
