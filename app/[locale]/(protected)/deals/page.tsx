import { Resource } from "@/generated/prisma";

import { DealsCard } from "./components/deals-card";

import { getGetDealsInteractor } from "@/core/app-di";
import { requireAccess } from "@/features/auth/next/require";
import { decodeGetParams } from "@/core/utils/get-params";
import { PageContainer } from "@/components/shared/page-container";

type Props = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export default async function DealsPage({ searchParams }: Props) {
  await requireAccess({ resource: Resource.deals });

  const params = await searchParams;
  const dealParams = decodeGetParams(params);

  const deals = await getGetDealsInteractor().invoke({ ...dealParams, p13nId: "deals-card-store" });

  return (
    <PageContainer padded={false}>
      <DealsCard deals={deals.ok ? deals.data : { items: [] }} />
    </PageContainer>
  );
}
