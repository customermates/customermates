import { Resource } from "@/generated/prisma";

import { InboxList } from "./components/inbox-list";
import { ThreadPanel } from "./components/thread-panel";

import {
  getGetMessagingThreadInteractor,
  getGetMessagingThreadsInteractor,
  getGetSubscriptionInteractor,
} from "@/core/di";
import { requireAccess } from "@/features/auth/next/require";
import { decodeGetParams } from "@/core/utils/get-params";
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { PageContainer } from "@/components/shared/page-container";
import { LockedFeatureOverlay } from "@/components/shared/locked-feature-overlay";
import { getEntitlements } from "@/ee/subscription/entitlements";
import { env } from "@/env";
import { cn } from "@/core/utils/cn";

type Props = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export default async function InboxPage({ searchParams }: Props) {
  await requireAccess({ resource: Resource.inboxMessages });

  if (env.APP_MODE === "self-hosted") redirect("/dashboard");

  const subscriptionResult = await getGetSubscriptionInteractor().invoke();
  const locked = !getEntitlements(subscriptionResult.data.plan).messaging;

  const { threadId: threadIdRaw, ...listParams } = await searchParams;
  const threadId = !locked && typeof threadIdRaw === "string" ? threadIdRaw : null;
  const threadParams = decodeGetParams(listParams);

  const threadResult = threadId ? await getGetMessagingThreadInteractor().invoke({ threadId }) : null;

  if (threadResult && !threadResult.ok) redirect("/inbox");

  const listResult = locked
    ? null
    : await getGetMessagingThreadsInteractor().invoke({ ...threadParams, p13nId: "messaging-threads-card-store" });

  const threadDetail = threadResult?.ok ? threadResult.data : null;

  const content = (
    <div className="flex h-full min-h-0 flex-1 lg:grid lg:grid-cols-[380px_1fr]">
      <div className={cn("min-h-0 min-w-0 flex-1 lg:border-r lg:border-border", threadId && "hidden lg:block")}>
        <InboxList selectedThreadId={threadId} threads={listResult?.ok ? listResult.data : { items: [] }} />
      </div>

      <div className={cn("min-h-0 min-w-0 flex-1", !threadId && "hidden lg:block")}>
        <ThreadPanel threadDetail={threadDetail} />
      </div>
    </div>
  );

  if (!locked) return <PageContainer padded={false}>{content}</PageContainer>;

  const t = await getTranslations();

  return (
    <PageContainer padded={false}>
      <LockedFeatureOverlay
        ctaHref="/company/subscription"
        ctaLabel={t("MessagingUpsell.cta")}
        description={t("MessagingUpsell.description")}
        title={t("MessagingUpsell.title")}
      >
        {content}
      </LockedFeatureOverlay>
    </PageContainer>
  );
}
