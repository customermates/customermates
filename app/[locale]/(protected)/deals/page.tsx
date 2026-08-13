import { Resource } from "@/generated/prisma";

import { DealsPageView } from "./components/deals-page-view";

import { getGetDealsInteractor } from "@/core/di";
import { requireAccess } from "@/features/auth/next/require";
import { decodeGetParams } from "@/core/utils/get-params";
import { PageContainer } from "@/components/shared/page-container";
import { unwrapValidated } from "@/core/validation/validation.utils";

export const maxDuration = 60;

type Props = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export default async function DealsPage({ searchParams }: Props) {
  await requireAccess({ resource: Resource.deals });

  const params = await searchParams;
  const dealParams = decodeGetParams(params);

  const deals = await unwrapValidated(getGetDealsInteractor().invoke({ ...dealParams, p13nId: "deals-card-store" }));

  return (
    <PageContainer padded={false}>
      <DealsPageView deals={deals} />
    </PageContainer>
  );
}
