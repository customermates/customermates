import { Resource } from "@/generated/prisma/client";

import { ApiKeysCard } from "../components/api-keys-card";

import { getGetApiKeysInteractor } from "@/core/di";
import { requireAccess } from "@/features/auth/next/require";
import { PageContainer } from "@/components/shared/page-container";
import { unwrapValidated } from "@/core/validation/validation.utils";

export default async function ProfileApiKeysPage() {
  await requireAccess({ resource: Resource.api });

  const apiKeys = await unwrapValidated(getGetApiKeysInteractor().invoke());

  return (
    <PageContainer>
      <ApiKeysCard apiKeys={apiKeys} />
    </PageContainer>
  );
}
