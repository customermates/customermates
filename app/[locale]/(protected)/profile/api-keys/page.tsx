import { Resource } from "@/generated/prisma/client";

import { ApiKeysCard } from "../components/api-keys-card";

import { getGetApiKeysInteractor, getRouteGuardService } from "@/core/app-di";
import { PageContainer } from "@/components/shared/page-container";

export default async function ProfileApiKeysPage() {
  await getRouteGuardService().ensureAccessOrRedirect({ resource: Resource.api });

  const result = await getGetApiKeysInteractor().invoke();

  return (
    <PageContainer>
      <ApiKeysCard apiKeys={result.data} />
    </PageContainer>
  );
}
