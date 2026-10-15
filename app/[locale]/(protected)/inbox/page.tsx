import { Resource } from "@/generated/prisma";

import { InboxList } from "./components/inbox-list";
import { InboxSurface } from "./components/inbox-surface";
import { ThreadPanel } from "./components/thread-panel";

import {
  getGetMessagingAccountsStateInteractor,
  getGetMessagingThreadInteractor,
  getGetMessagingThreadsInteractor,
} from "@/core/di";
import { requireAccess } from "@/features/auth/next/require";
import { readSurfaceParams } from "@/core/data-view/next/read-surface-params";
import { SURFACE } from "@/core/data-view/data-view-keys";
import { redirect } from "next/navigation";
import { getLocale, getTranslations } from "next-intl/server";
import { PageContainer } from "@/components/shared/page-container";
import { LockedFeatureOverlay } from "@/components/shared/locked-feature-overlay";
import { env } from "@/env";
import { cn } from "@/core/utils/cn";
import { unwrapPage } from "@/core/validation/next/unwrap-page";
import { settingsHref } from "@/app/components/navigation/settings-routes";
import { buildLocalePath } from "@/i18n/locale-registry";

const LATEST_THREAD_ID = "latest";

type Props = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export default async function InboxPage({ searchParams }: Props) {
  await requireAccess({ resource: Resource.inboxMessages });

  if (env.APP_MODE === "self-hosted") redirect("/dashboard");

  const messaging = await unwrapPage(getGetMessagingAccountsStateInteractor().invoke());
  const locked = messaging.state !== "available";
  const canConnect = messaging.state === "available" && messaging.canConnect;

  const { threadId: threadIdRaw, ...listParams } = await searchParams;
  const requestedThreadId = !locked && typeof threadIdRaw === "string" ? threadIdRaw : null;
  const threadParams = await readSurfaceParams(SURFACE.messagingThreads, listParams);

  const threads = locked ? { items: [] } : await unwrapPage(getGetMessagingThreadsInteractor().invoke(threadParams));

  if (requestedThreadId === LATEST_THREAD_ID) {
    const query = new URLSearchParams();
    for (const [key, value] of Object.entries(listParams)) if (typeof value === "string") query.set(key, value);
    const latestThreadId = threads.items[0]?.id;
    if (latestThreadId) query.set("threadId", latestThreadId);
    const search = query.toString();
    redirect(buildLocalePath(await getLocale(), search ? `/inbox?${search}` : "/inbox"));
  }

  const threadId = requestedThreadId;

  const threadResult = threadId ? await getGetMessagingThreadInteractor().invoke({ threadId }) : null;

  if (threadResult && !threadResult.ok) redirect("/inbox");

  const threadDetail = threadResult?.ok ? threadResult.data : null;

  const content = (
    <InboxSurface locked={locked} threads={threads}>
      <div className="flex min-h-0 flex-1 lg:grid lg:grid-cols-[380px_1fr]">
        <div className={cn("min-h-0 min-w-0 flex-1 lg:border-r lg:border-border", threadId && "hidden lg:block")}>
          <InboxList canConnect={canConnect} locked={locked} selectedThreadId={threadId} threads={threads} />
        </div>

        <div className={cn("min-h-0 min-w-0 flex-1", !threadId && "hidden lg:block")}>
          <ThreadPanel locked={locked} threadDetail={threadDetail} />
        </div>
      </div>
    </InboxSurface>
  );

  if (!locked) return <PageContainer padded={false}>{content}</PageContainer>;

  const t = await getTranslations();

  return (
    <PageContainer padded={false}>
      <LockedFeatureOverlay
        ctaHref={settingsHref("billing")}
        ctaLabel={t("MessagingUpsell.cta")}
        description={
          messaging.state === "locked" && messaging.reason === "subscription"
            ? t("ConnectedAccountsCard.paidSubscriptionRequired")
            : t("MessagingUpsell.description")
        }
        title={t("MessagingUpsell.title")}
      >
        {content}
      </LockedFeatureOverlay>
    </PageContainer>
  );
}
