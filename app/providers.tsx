import { NextIntlClientProvider } from "next-intl";
import { RootProvider } from "fumadocs-ui/provider/next";

import { ServerThemeProvider } from "@/components/server-theme-provider";

type DeepPartial<Type> = {
  [Key in keyof Type]?: Type[Key] extends object ? DeepPartial<Type[Key]> : Type[Key];
};

type Props = {
  children: React.ReactNode;
  defaultTheme?: string;
  displayLanguage: string | undefined;
  messages?: DeepPartial<Record<string, any>> | null | undefined;
};

export function Providers({ children, defaultTheme, displayLanguage, messages }: Props) {
  return (
    <RootProvider
      search={{
        enabled: false,
      }}
    >
      <ServerThemeProvider serverTheme={defaultTheme}>
        <NextIntlClientProvider locale={displayLanguage} messages={messages} timeZone="UTC">
          {children}
        </NextIntlClientProvider>
      </ServerThemeProvider>
    </RootProvider>
  );
}
