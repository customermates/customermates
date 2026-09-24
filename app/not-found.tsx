import { MarketingShell } from "./components/navigation/marketing-shell";

import { resolveRequestAccountState } from "@/features/auth/next/resolve-account-state";
import { NotFoundPageView } from "@/components/shared/not-found-page-view";

export default async function NotFoundPage() {
  const account = await resolveRequestAccountState();

  return (
    <MarketingShell accountState={account.state}>
      <NotFoundPageView />
    </MarketingShell>
  );
}
