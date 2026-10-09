import { latin, mono } from "./fonts";
import { Providers } from "./providers";

import { sessionHintDocumentScript } from "@/features/auth/session-hint";
import { pickMarketingMessages } from "@/i18n/marketing-messages";

type Props = {
  children: React.ReactNode;
  displayLanguage: string;
  messages: Record<string, unknown>;
};

export function RootDocument({ children, displayLanguage, messages }: Props) {
  return (
    <html
      suppressHydrationWarning
      className={`${latin.variable} ${mono.variable} ${latin.className}`}
      data-scroll-behavior="smooth"
      lang={displayLanguage}
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: sessionHintDocumentScript }} />
      </head>

      <body className="h-svh flex flex-col font-sans antialiased">
        <Providers displayLanguage={displayLanguage} messages={pickMarketingMessages(messages)}>
          {children}
        </Providers>
      </body>
    </html>
  );
}
