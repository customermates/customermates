import { PageContainer } from "@/components/shared/page-container";
import { getGetPlannerOptionsInteractor } from "@/core/di";
import { requireAccess } from "@/features/auth/next/require";
import { unwrapPage } from "@/core/validation/next/unwrap-page";
import { PlannerPageView } from "./components/planner-page-view";

export default async function CalendarPage() {
  await requireAccess();
  const options = await unwrapPage(getGetPlannerOptionsInteractor().invoke());
  return (
    <PageContainer padded={false}>
      <PlannerPageView options={options} />
    </PageContainer>
  );
}
