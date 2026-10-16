import { notFound } from "next/navigation";

import { OperatorUsagePageView } from "../components/usage/operator-usage-page-view";

import { PageContainer } from "@/components/shared/page-container";
import { getGetOperatorBillingUsageInteractor } from "@/core/di";
import { appErrorDetails } from "@/core/errors/app-errors";
import { unwrapPage } from "@/core/validation/next/unwrap-page";
import { lastFullBillingUsageMonth } from "@/ee/operator/billing-usage";
import { BILLING_USAGE_MONTH_PATTERN } from "@/ee/operator/billing-usage.schema";

type Props = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export default async function OperatorUsagePage({ searchParams }: Props) {
  const requested = (await searchParams).month;
  const month =
    typeof requested === "string" && BILLING_USAGE_MONTH_PATTERN.test(requested)
      ? requested
      : lastFullBillingUsageMonth(new Date());

  try {
    const usage = await unwrapPage(getGetOperatorBillingUsageInteractor().invoke({ month }));

    return (
      <PageContainer>
        <OperatorUsagePageView usage={usage} />
      </PageContainer>
    );
  } catch (error) {
    if (appErrorDetails(error)) notFound();
    throw error;
  }
}
