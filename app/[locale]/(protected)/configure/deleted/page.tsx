import { getGetRecentlyDeletedInteractor } from "@/core/di";
import { requireAccess } from "@/features/auth/next/require";
import { PageContainer } from "@/components/shared/page-container";
import { RecentlyDeletedView } from "./components/recently-deleted-view";

export default async function RecentlyDeletedPage() {
  await requireAccess();
  const result = await getGetRecentlyDeletedInteractor().invoke({});
  return (
    <PageContainer>
      <RecentlyDeletedView initial={result.ok ? result.data : null} />
    </PageContainer>
  );
}
