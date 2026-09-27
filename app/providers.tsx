import { NextIntlClientProvider } from "next-intl";
import { RootProvider } from "fumadocs-ui/provider/next";

type DeepPartial<Type> = {
  [Key in keyof Type]?: Type[Key] extends object ? DeepPartial<Type[Key]> : Type[Key];
};

type Props = {
  children: React.ReactNode;
  displayLanguage: string | undefined;
  messages?: DeepPartial<Record<string, any>> | null | undefined;
};

export function Providers({ children, displayLanguage, messages }: Props) {
  return (
    <RootProvider
      search={{
        enabled: false,
      }}
    >
      <NextIntlClientProvider locale={displayLanguage} messages={messages} timeZone="UTC">
        {children}
      </NextIntlClientProvider>
    </RootProvider>
  );
}
