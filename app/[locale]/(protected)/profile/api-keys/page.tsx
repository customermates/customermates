import { Resource } from "@/generated/prisma/client";

import { ApiKeysCard } from "../components/api-keys-card";

import { getGetApiKeysInteractor } from "@/core/app-di";
import { requireAccess } from "@/features/auth/next/require";
import { PageContainer } from "@/components/shared/page-container";

export default async function ProfileApiKeysPage() {
  await requireAccess({ resource: Resource.api });

  const result = await getGetApiKeysInteractor().invoke();

  return (
    <PageContainer>
      <ApiKeysCard apiKeys={result.data} />
    </PageContainer>
  );
}
