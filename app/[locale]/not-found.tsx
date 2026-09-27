import { MarketingShell } from "@/app/components/navigation/marketing-shell";
import { NotFoundPageView } from "@/components/shared/not-found-page-view";

export default function LocaleNotFoundPage() {
  return (
    <MarketingShell>
      <NotFoundPageView />
    </MarketingShell>
  );
}
