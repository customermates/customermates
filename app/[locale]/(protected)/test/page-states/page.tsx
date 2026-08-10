import { getTranslations } from "next-intl/server";

import type { PageSkeletonSpec } from "@/components/page-state/page-skeleton";

import { PageState } from "@/components/page-state/page-state";
import { Button } from "@/components/ui/button";
import { requireAccess } from "@/features/auth/next/require";

const ARCHETYPES = {
  board: { identity: "text", kind: "data-view", view: "board" },
  cards: { identity: "avatar", kind: "data-view", view: "cards" },
  dashboard: { kind: "dashboard" },
  detail: { kind: "detail" },
  inbox: { kind: "inbox" },
  settings: { kind: "settings" },
  settingsCards: { card: "connected-accounts", kind: "settings", view: "cards" },
  special: { kind: "settings", view: "centered-card" },
  table: { kind: "data-view", tableVariant: "contact", view: "table" },
} as const satisfies Record<string, PageSkeletonSpec>;

type Props = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export default async function PageStateGalleryPage({ searchParams }: Props) {
  await requireAccess();
  const params = await searchParams;
  const archetype = typeof params.archetype === "string" && params.archetype in ARCHETYPES ? params.archetype : "table";
  const state = params.state === "empty" || params.state === "error" ? params.state : "loading";
  const authorized = params.permission !== "denied";
  const spec = ARCHETYPES[archetype as keyof typeof ARCHETYPES];
  const t = await getTranslations();

  return (
    <div
      data-page-state-gallery-fixture
      className="flex min-h-[calc(100svh-5rem)] flex-col p-4 md:p-6"
      data-page-archetype={archetype}
    >
      {state === "loading" ? (
        <PageState label={t("PageState.loading")} skeleton={spec} state="loading" />
      ) : state === "empty" ? (
        <PageState
          action={authorized ? <Button size="sm">{t("Common.actions.add")}</Button> : undefined}
          skeleton={spec}
          state="empty"
          title={t("Common.emptyState.genericTitle")}
        />
      ) : (
        <PageState
          action={authorized ? <Button size="sm">{t("ErrorCard.retry")}</Button> : undefined}
          description={t("ErrorCard.contactSupport")}
          state="error"
          title={t("ErrorCard.title")}
        />
      )}
    </div>
  );
}
