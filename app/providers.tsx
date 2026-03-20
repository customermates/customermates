import { HeroUIProvider } from "@heroui/system";
import { NextIntlClientProvider } from "next-intl";
import { RootProvider } from "fumadocs-ui/provider/next";

import { RootStoreProvider } from "@/core/stores/root-store.provider";
import { ServerThemeProvider } from "@/components/server-theme-provider";

type DeepPartial<Type> = {
  [Key in keyof Type]?: Type[Key] extends object ? DeepPartial<Type[Key]> : Type[Key];
};

type Props = {
  children: React.ReactNode;
  defaultTheme?: string;
  displayLanguage: string | undefined;
  formattingLocale: string | undefined;
  initialNavbarVisible?: boolean;
  initialSidebarOpen?: boolean;
  isDemoMode?: boolean;
  isCloudHosted?: boolean;
  messages?: DeepPartial<Record<string, any>> | null | undefined;
};

export function Providers({
  children,
  defaultTheme,
  displayLanguage,
  formattingLocale,
  initialNavbarVisible,
  initialSidebarOpen,
  isDemoMode,
  isCloudHosted,
  messages,
}: Props) {
  return (
    <RootProvider
      search={{
        enabled: false,
      }}
    >
      <ServerThemeProvider serverTheme={defaultTheme}>
        <NextIntlClientProvider locale={displayLanguage} messages={messages} timeZone="UTC">
          <HeroUIProvider locale={formattingLocale}>
            <RootStoreProvider
              initialNavbarVisible={initialNavbarVisible}
              initialSidebarOpen={initialSidebarOpen}
              isCloudHosted={isCloudHosted}
              isDemoMode={isDemoMode}
            >
              {children}
            </RootStoreProvider>
          </HeroUIProvider>
        </NextIntlClientProvider>
      </ServerThemeProvider>
    </RootProvider>
  );
}
