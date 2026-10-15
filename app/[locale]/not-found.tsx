import { MarketingShell } from "@/app/components/navigation/marketing-shell";
import { NotFoundPageView } from "@/components/shared/not-found-page-view";
import { env } from "@/env";

export default function LocaleNotFoundPage() {
  return (
    <MarketingShell appMode={env.APP_MODE}>
      <NotFoundPageView />
    </MarketingShell>
  );
}
