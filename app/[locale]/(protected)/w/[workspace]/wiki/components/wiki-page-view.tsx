"use client";

import type { WikiGraph } from "@/features/wiki/wiki-graph.schema";
import type { WikiPageDto } from "@/features/wiki/wiki.schema";
import type { ReactNode } from "react";
import type { WikiHomepageSetupState } from "@/features/wiki/get-wiki-homepage-setup-state.interactor";

import { useCallback, useEffect, useLayoutEffect, useMemo, useState, useTransition } from "react";
import { observer } from "mobx-react-lite";
import { reaction } from "mobx";
import { Action, Resource } from "@/generated/prisma";
import { BookOpen, Loader2, Plus, Sparkles } from "lucide-react";
import { useTranslations } from "next-intl";

import { useSetTopBarActions } from "@/app/components/topbar-actions-context";
import { AgentStarterActions } from "@/app/components/agent-chat/suggested-questions";
import { PageState } from "@/components/page-state/page-state";
import { Alert } from "@/components/shared/alert";
import { Button } from "@/components/ui/button";
import { useRootStore } from "@/core/stores/root-store.provider";
import { useNavigationGuard } from "@/components/modal/use-navigation-guard";
import { runUserAction } from "@/core/errors/report-application-error";
import { useRouter } from "@/i18n/navigation";
import {
  EMPTY_WIKI_HOMEPAGE_SETUP_STATE,
  useLiveWikiSetupState,
  useWikiSetupFailureBody,
} from "@/components/wiki/wiki-homepage-setup";
import { WikiSetupProgress } from "@/components/wiki/wiki-setup-progress";
import { wikiPagePath } from "@/features/wiki/wiki-links";
import { useIsWiderThan } from "@/hooks/use-media-query";
import { serverRenderedClient } from "@/core/utils/server-rendered-client";

import { useWikiGraphPositions } from "./use-wiki-graph-positions";
import { wikiGraphVisibleIds } from "./wiki-graph-model";
import { WikiGraphView } from "./wiki-graph-view";
import { WikiPageActions } from "./wiki-page-actions";
import { WikiPageList } from "./wiki-page-list";
import { WikiPageSheet } from "./wiki-page-sheet";
import { WikiPageSkeleton } from "./wiki-page-skeleton";
import { resolveWikiPageState, resolveWikiSheetState } from "./wiki-page-state";
import { WikiProposals } from "./wiki-proposals";
import { WikiProposalsEntry } from "./wiki-proposals-entry";
import { WikiProposalsStore } from "./wiki-proposals.store";
import { WikiSearchStore } from "./wiki-search.store";

type Props = {
  graph: WikiGraph | null;
  initialPage: WikiPageDto | null;
  initialSetupState?: WikiHomepageSetupState;
  openProposals?: boolean;
  requestedPageId?: string;
  unavailable?: boolean;
};

const WikiPageViewContent = observer(function WikiPageView({
  graph,
  initialPage,
  initialSetupState = EMPTY_WIKI_HOMEPAGE_SETUP_STATE,
  openProposals = false,
  requestedPageId,
  unavailable = false,
}: Props) {
  const t = useTranslations();
  const rootStore = useRootStore();
  const router = useRouter();
  const [isNavigating, startNavigation] = useTransition();
  const [pending, setPending] = useState<{ id: string | null } | null>(null);
  const [store] = useState(() => {
    const cached = rootStore.wikiPageStore;
    cached.initializeServerPage(initialPage, requestedPageId);
    return cached;
  });
  useNavigationGuard(store);
  const [search] = useState(() => new WikiSearchStore());
  useEffect(() => () => search.dispose(), [search]);
  const userStore = rootStore.userStore as typeof rootStore.userStore | undefined;
  const canReviewProposals = typeof userStore?.can === "function" && userStore.can(Resource.wiki, Action.update);
  const [proposals] = useState(() => new WikiProposalsStore(rootStore, () => router.refresh()));
  useEffect(() => {
    if (!canReviewProposals) return;
    proposals.bind();
    if (openProposals) proposals.setOpen(true);
    return () => proposals.dispose();
  }, [canReviewProposals, openProposals, proposals]);
  const canApplyProposal = useCallback(
    (action: "create" | "update" | "delete") =>
      Boolean(
        userStore?.can(
          Resource.wiki,
          action === "create" ? Action.create : action === "update" ? Action.update : Action.delete,
        ),
      ),
    [userStore],
  );
  const setupState = useLiveWikiSetupState(initialSetupState);
  const importRunning = setupState.status === "working";
  const pageCount = graph?.nodes.length ?? 0;
  const hasPages = pageCount > 0 || initialPage !== null || initialSetupState.pages.length > 0;

  useLayoutEffect(() => {
    store.receiveServerPage(initialPage, requestedPageId);
    const savedState = store.savedState;
    return reaction(
      () => store.creating || store.hasUnsavedChanges || store.isLoading,
      (blocked) => {
        if (!blocked && store.savedState === savedState) store.receiveServerPage(initialPage, requestedPageId);
      },
    );
  }, [initialPage, requestedPageId, store]);

  const openId = pending && isNavigating ? pending.id : (requestedPageId ?? null);
  const missing =
    !store.creating &&
    openId !== null &&
    openId === (requestedPageId ?? null) &&
    (store.unavailable || (unavailable && !store.awaitingSelection && !store.hasUnsavedChanges && !store.isLoading));
  const sheetState = resolveWikiSheetState({
    openId,
    loadedId: store.form.id,
    creating: store.creating,
    awaiting: store.awaitingSelection,
    missing,
  });
  const wide = useIsWiderThan("lg");
  const pageState = resolveWikiPageState({
    failed: graph === null,
    hasPages: pageCount > 0,
    setupActive: importRunning && !hasPages,
  });
  const setupFailedBody = useWikiSetupFailureBody(setupState);
  const setupFailed = store.allows(Action.create) && setupState.status === "failed";
  const positions = useWikiGraphPositions(graph);
  const canPin = store.allows(Action.update) && rootStore.appMode !== "demo";
  const visible = useMemo(
    () => wikiGraphVisibleIds(graph?.nodes ?? [], { query: search.query, kind: null, found: search.found }),
    [graph, search.found, search.query],
  );
  const tryNavigate = useCallback(
    (navigate: () => void) => rootStore.navigationGuard.tryNavigate(navigate),
    [rootStore],
  );
  const create = useCallback(() => {
    tryNavigate(() => store.startCreate());
  }, [store, tryNavigate]);
  const selectPage = useCallback(
    (pageId: string) => {
      if (!store.creating && pageId === store.form.id && pageId === requestedPageId) return;
      tryNavigate(() => {
        store.load(initialPage);
        setPending({ id: pageId });
        startNavigation(() => router.push(wikiPagePath(pageId)));
      });
    },
    [initialPage, requestedPageId, router, store, tryNavigate],
  );
  const closeSheet = useCallback(() => {
    tryNavigate(() => {
      store.load(initialPage);
      if (!requestedPageId) return;
      setPending({ id: null });
      startNavigation(() => router.push("/wiki"));
    });
  }, [initialPage, requestedPageId, router, store, tryNavigate]);
  const reload = useCallback(() => tryNavigate(() => runUserAction(store.reload)), [store, tryNavigate]);
  const openFirstMatch = useCallback(() => {
    const ranked = search.foundQuery === search.query.trim() ? search.found.values().next().value : undefined;
    const onMap = graph?.nodes.find((node) => visible.has(node.id))?.id;
    const first = graph?.truncated ? (ranked ?? onMap) : (onMap ?? ranked);
    if (first) selectPage(first);
  }, [graph, search.found, search.foundQuery, search.query, selectPage, visible]);
  const topBar = useMemo(
    () => (
      <WikiPageActions
        proposals={canReviewProposals ? <WikiProposalsEntry store={proposals} /> : undefined}
        search={pageCount > 0 ? search : null}
        store={store}
        onCreate={create}
        onOpenFirst={openFirstMatch}
      />
    ),
    [canReviewProposals, create, openFirstMatch, pageCount, proposals, search, store],
  );
  useSetTopBarActions(topBar);

  const sheetPageId = sheetState === "page" && !store.creating ? store.form.id : null;
  const sheetNode = sheetPageId ? (positions.nodes.find((node) => node.id === sheetPageId) ?? null) : null;
  const otherGuide = (graph?.nodes ?? []).some((node) => node.kind === "guide" && node.id !== store.form.id);

  let body: ReactNode;
  switch (pageState) {
    case "error":
      body = (
        <PageState
          action={
            <Button size="sm" variant="secondary" onClick={() => router.refresh()}>
              {t("ErrorCard.retry")}
            </Button>
          }
          description={t("Wiki.graph.loadFailed")}
          state="error"
          title={t("Wiki.unavailableTitle")}
        />
      );
      break;
    case "setup":
      body = (
        <PageState
          action={<WikiSetupProgress state={setupState} />}
          background={<WikiPageSkeleton animated={false} />}
          description={
            setupState.domain
              ? t("WikiSetup.status.workingBodyWiki", { domain: setupState.domain })
              : t("WikiSetup.status.workingBodyAnswers")
          }
          icon={Sparkles}
          state="empty"
          title={t("WikiSetup.status.workingTitle")}
        />
      );
      break;
    case "empty":
      body = (
        <PageState
          action={
            <AgentStarterActions
              fallback={
                store.allows(Action.create) ? (
                  <Button disabled={store.isLoading} size="sm" variant="secondary" onClick={create}>
                    <Plus aria-hidden="true" />

                    {t("Wiki.newPage")}
                  </Button>
                ) : undefined
              }
              pageId="wiki"
              state="empty"
              surface="page"
            />
          }
          background={<WikiPageSkeleton animated={false} />}
          description={store.allows(Action.create) ? t("Wiki.emptyBody") : t("Wiki.emptyBodyReadOnly")}
          icon={BookOpen}
          state="empty"
          title={t("Wiki.emptyTitle")}
        />
      );
      break;
    case "content":
      body = graph && (
        <>
          {importRunning && (
            <div className="shrink-0 px-4 pt-3" data-wiki-import-banner="">
              <Alert
                aria-live="polite"
                className="py-2"
                description={t("WikiSetup.status.backgroundBanner")}
                icon={<Loader2 className="animate-spin motion-reduce:animate-none" />}
                role="status"
              />
            </div>
          )}

          {wide ? (
            <WikiGraphView
              canPin={canPin}
              found={search.found}
              graph={graph}
              positions={positions}
              query={search.query}
              selectedId={openId}
              onSelect={selectPage}
            />
          ) : (
            <WikiPageList nodes={graph.nodes} truncated={graph.truncated} visible={visible} onSelect={selectPage} />
          )}
        </>
      );
      break;
    default: {
      const exhaustive: never = pageState;
      body = exhaustive;
    }
  }

  return (
    <section
      aria-label={t("Wiki.graph.label")}
      className="relative flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden"
      data-wiki-document-layout=""
      id="wiki-document-panel"
    >
      {setupFailed && (
        <div className="shrink-0 px-4 pt-3">
          <Alert description={setupFailedBody} variant={hasPages ? "warning" : "destructive"} />
        </div>
      )}

      {body}

      <WikiPageSheet
        canPin={canPin && wide}
        open={sheetState !== "closed"}
        otherGuide={otherGuide}
        pinned={sheetNode ? sheetNode.pinned : null}
        state={sheetState === "closed" ? "loading" : sheetState}
        store={store}
        onClose={closeSheet}
        onReload={reload}
        onSelect={selectPage}
        onTogglePin={() => {
          if (!sheetNode) return;
          const origin = { x: sheetNode.x, y: sheetNode.y, pinned: sheetNode.pinned };
          runUserAction(() => positions.pin(sheetNode.id, sheetNode.pinned ? null : origin, origin));
        }}
      />

      {canReviewProposals && <WikiProposals canApply={canApplyProposal} store={proposals} />}
    </section>
  );
});

export const WikiPageView = serverRenderedClient(WikiPageViewContent);
