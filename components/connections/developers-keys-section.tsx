import { ApiKeysPageView } from "@/app/[locale]/(protected)/w/[workspace]/settings/(account)/components/api-keys-page-view";
import { ConnectionScopeLine } from "@/components/connections/connection-scope-line";
import { getGetApiKeysInteractor } from "@/core/di";
import { unwrapPage } from "@/core/validation/next/unwrap-page";

export async function DevelopersKeysSection() {
  const apiKeys = await unwrapPage(getGetApiKeysInteractor().invoke());

  return (
    <div className="flex flex-col gap-4">
      <ConnectionScopeLine owner="workspace" scope="keys" />

      <ApiKeysPageView apiKeys={apiKeys} />
    </div>
  );
}
