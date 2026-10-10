import { DashboardPageView } from "./components/dashboard-page-view";

import { PageContainer } from "@/components/shared/page-container";
import { SURFACE } from "@/core/data-view/data-view-keys";
import { readSurfaceParams } from "@/core/data-view/next/read-surface-params";
import { getDiscoverRecordTypesInteractor, getGetWidgetsInteractor } from "@/core/di";
import { requireAccess } from "@/features/auth/next/require";

type Props = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export default async function DashboardPage({ searchParams }: Props) {
  await requireAccess();

  const params = await readSurfaceParams(SURFACE.dashboard, searchParams);
  const [widgetsResult, recordTypesResult] = await Promise.all([
    getGetWidgetsInteractor().invoke({ viewId: params.viewId }),
    getDiscoverRecordTypesInteractor().invoke({ includeEmbedded: true, page: 1, pageSize: 25 }),
  ]);

  return (
    <PageContainer padded={false}>
      <DashboardPageView
        dashboard={widgetsResult.data}
        recordTypes={recordTypesResult.ok ? recordTypesResult.data : undefined}
      />
    </PageContainer>
  );
}
