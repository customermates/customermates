import { getGetNotificationsInteractor } from "@/core/di";
import { PageContainer } from "@/components/shared/page-container";
import { unwrapPage } from "@/core/validation/next/unwrap-page";
import { requireAccess } from "@/features/auth/next/require";

import { NOTIFICATIONS_PAGE_SIZE } from "./components/notifications-page-model";
import { NotificationsPageView } from "./components/notifications-page-view";

export default async function NotificationsPage() {
  await requireAccess();

  const inbox = await unwrapPage(
    getGetNotificationsInteractor().invoke({ limit: NOTIFICATIONS_PAGE_SIZE, unreadOnly: false }),
  );

  return (
    <PageContainer padded={false}>
      <NotificationsPageView initialInbox={inbox} />
    </PageContainer>
  );
}
