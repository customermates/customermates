import { getMessages } from "next-intl/server";

import { MarketingShell } from "./components/navigation/marketing-shell";
import { RootDocument } from "./root-document";

import { NotFoundPageView } from "@/components/shared/not-found-page-view";
import { DEFAULT_LOCALE } from "@/i18n/locale-registry";

export default async function NotFoundPage() {
  const messages = await getMessages({ locale: DEFAULT_LOCALE });

  return (
    <RootDocument displayLanguage={DEFAULT_LOCALE} messages={messages}>
      <MarketingShell>
        <NotFoundPageView locale={DEFAULT_LOCALE} />
      </MarketingShell>
    </RootDocument>
  );
}
