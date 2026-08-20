import { NextIntlClientProvider } from "next-intl";
import { RootProvider } from "fumadocs-ui/provider/next";

import { RootStoreProvider } from "@/core/stores/root-store.provider";
import { ServerThemeProvider } from "@/components/server-theme-provider";
import type { AppMode } from "@/core/config/environment";

type DeepPartial<Type> = {
  [Key in keyof Type]?: Type[Key] extends object ? DeepPartial<Type[Key]> : Type[Key];
};

type Props = {
  agentChatEnabled: boolean;
  appMode: AppMode;
  children: React.ReactNode;
  defaultTheme?: string;
  displayLanguage: string | undefined;
  messages?: DeepPartial<Record<string, any>> | null | undefined;
};

export function Providers({ agentChatEnabled, appMode, children, defaultTheme, displayLanguage, messages }: Props) {
  return (
    <RootProvider
      search={{
        enabled: false,
      }}
    >
      <ServerThemeProvider serverTheme={defaultTheme}>
        <NextIntlClientProvider locale={displayLanguage} messages={messages} timeZone="UTC">
          <RootStoreProvider agentChatEnabled={agentChatEnabled} appMode={appMode}>
            {children}
          </RootStoreProvider>
        </NextIntlClientProvider>
      </ServerThemeProvider>
    </RootProvider>
  );
}
