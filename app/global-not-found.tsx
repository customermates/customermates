import "@/styles/globals.css";

import { getLocale, getMessages } from "next-intl/server";

import { MarketingShell } from "./components/navigation/marketing-shell";
import { RootDocument } from "./root-document";

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
      <MarketingShell accountState={account.state}>
        <NotFoundPageView />
      </MarketingShell>
    </RootDocument>
  );
}
