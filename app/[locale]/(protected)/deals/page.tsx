import { Resource } from "@/generated/prisma";

import { DealsCard } from "./components/deals-card";

import { di } from "@/core/dependency-injection/container";
import { decodeGetParams } from "@/core/utils/get-params";
import { GetDealsInteractor } from "@/features/deals/get/get-deals.interactor";
import { RouteGuardService } from "@/features/auth/route-guard.service";
import { XPageContainer } from "@/components/x-layout-primitives/x-page-container";

type Props = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export default async function DealsPage({ searchParams }: Props) {
  await di.get(RouteGuardService).ensureAccessOrRedirect({ resource: Resource.deals });

  const params = await searchParams;
  const dealParams = decodeGetParams(params);

  const deals = await di.get(GetDealsInteractor).invoke({ ...dealParams, p13nId: "deals-card-store" });

  return (
    <XPageContainer>
      <DealsCard deals={deals.ok ? deals.data : { items: [] }} />
    </XPageContainer>
  );
}
