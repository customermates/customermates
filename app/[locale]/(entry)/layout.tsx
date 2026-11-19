import "@/styles/application.css";

import { NextIntlClientProvider } from "next-intl";
import { getMessages, setRequestLocale } from "next-intl/server";

import { EntryShell } from "./entry-shell";

import { getAddressLookupService } from "@/core/di";
import { RootStoreProvider } from "@/core/stores/root-store.provider";
import { isAgentChatAvailable } from "@/ee/agent-chat/agent-availability";
import { env } from "@/env";
import { DEFAULT_LOCALE, isRoutingLocale } from "@/i18n/locale-registry";

type Props = {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
};

export default async function EntryLayout({ children, params }: Props) {
  const { locale } = await params;
  setRequestLocale(locale);

  return (
    <NextIntlClientProvider locale={locale} messages={await getMessages()} timeZone="UTC">
      <RootStoreProvider
        agentChatEnabled={isAgentChatAvailable()}
        appMode={env.APP_MODE}
        initialState={{
          locale: isRoutingLocale(locale) ? locale : DEFAULT_LOCALE,
          user: null,
          subscription: null,
          addressLookupAvailable: getAddressLookupService().enabled,
        }}
      >
        <EntryShell appMode={env.APP_MODE}>{children}</EntryShell>
      </RootStoreProvider>
    </NextIntlClientProvider>
  );
}
