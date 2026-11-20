import { Resource } from "@/generated/prisma/client";

import { ApiKeysPageView } from "../components/api-keys-page-view";

import { getGetApiKeysInteractor, getGetConnectedAppsInteractor } from "@/core/di";
import { requireAccess } from "@/features/auth/next/require";
import { PageContainer } from "@/components/shared/page-container";
import { unwrapPage } from "@/core/validation/next/unwrap-page";

export default async function ProfileApiKeysPage() {
  await requireAccess({ resource: Resource.api });

  const [apiKeys, connectedApps] = await Promise.all([
    unwrapPage(getGetApiKeysInteractor().invoke()),
    unwrapPage(getGetConnectedAppsInteractor().invoke()),
  ]);

  return (
    <PageContainer>
      <ApiKeysPageView apiKeys={apiKeys} connectedApps={connectedApps} />
    </PageContainer>
  );
}
