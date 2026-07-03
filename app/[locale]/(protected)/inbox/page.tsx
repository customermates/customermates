import { Resource } from "@/generated/prisma";

import { InboxList } from "./components/inbox-list";
import { ThreadPanel } from "./components/thread-panel";

import { getGetMessagingThreadInteractor, getGetMessagingThreadsInteractor } from "@/core/di";
import { requireAccess } from "@/features/auth/next/require";
import { decodeGetParams } from "@/core/utils/get-params";
import { redirect } from "@/i18n/navigation";
import { getLocale } from "next-intl/server";
import { PageContainer } from "@/components/shared/page-container";
import { cn } from "@/lib/utils";

type Props = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export default async function InboxPage({ searchParams }: Props) {
  await requireAccess({ resource: Resource.inboxMessages });

  const { threadId: threadIdRaw, ...listParams } = await searchParams;
  const threadId = typeof threadIdRaw === "string" ? threadIdRaw : null;
  const threadParams = decodeGetParams(listParams);

  const threadResult = threadId ? await getGetMessagingThreadInteractor().invoke({ threadId }) : null;

  if (threadResult && !threadResult.ok) redirect({ href: "/inbox", locale: await getLocale() });

  const listResult = await getGetMessagingThreadsInteractor().invoke({
    ...threadParams,
    p13nId: "messaging-threads-card-store",
  });

  const threadDetail = threadResult?.ok ? threadResult.data : null;

  return (
    <PageContainer padded={false}>
      <div className="flex h-full min-h-0 flex-1 lg:grid lg:grid-cols-[380px_1fr]">
        <div className={cn("min-h-0 min-w-0 flex-1 lg:border-r lg:border-border", threadId && "hidden lg:block")}>
          <InboxList selectedThreadId={threadId} threads={listResult.ok ? listResult.data : { items: [] }} />
        </div>

        <div className={cn("min-h-0 min-w-0 flex-1", !threadId && "hidden lg:block")}>
          <ThreadPanel threadDetail={threadDetail} />
        </div>
      </div>
    </PageContainer>
  );
}
