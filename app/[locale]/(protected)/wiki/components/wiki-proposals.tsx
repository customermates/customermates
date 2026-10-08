"use client";

import type { ReactNode } from "react";
import type { WikiPageKind } from "@/features/wiki/wiki.schema";
import type { WikiPageProposalAction, WikiPageProposalReviewItem } from "@/features/wiki/wiki-page-proposal.schema";
import type { WikiProposalsStore } from "./wiki-proposals.store";
import type { ChipColor } from "@/constants/chip-colors";

import { observer } from "mobx-react-lite";
import { ArrowLeft, Check, ChevronRight, Inbox, X } from "lucide-react";
import { useTranslations } from "next-intl";

import { AppChip } from "@/components/chip/app-chip";
import { Alert } from "@/components/shared/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetBody,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { Spinner } from "@/components/ui/spinner";
import { runUserAction } from "@/core/errors/report-application-error";
import { useHydratedIntlStore } from "@/core/stores/use-hydrated-intl-store";

const ACTION_CHIP_COLOR: Record<WikiPageProposalAction, ChipColor> = {
  create: "success",
  update: "info",
  delete: "destructive",
};

type Props = {
  store: WikiProposalsStore;
  canApply: (action: WikiPageProposalAction) => boolean;
};

type Translate = ReturnType<typeof useTranslations>;

function actionLabel(t: Translate, action: WikiPageProposalAction) {
  const labels: Record<WikiPageProposalAction, string> = {
    create: t("Wiki.proposals.action.create"),
    update: t("Wiki.proposals.action.update"),
    delete: t("Wiki.proposals.action.delete"),
  };
  return labels[action];
}

function kindLabel(t: Translate, kind: WikiPageKind | null | undefined) {
  if (!kind) return null;
  const labels: Record<WikiPageKind, string> = {
    guide: t("Wiki.kind.guide"),
    procedure: t("Wiki.kind.procedure"),
    knowledge: t("Wiki.kind.knowledge"),
  };
  return labels[kind];
}

function proposalTitle(proposal: WikiPageProposalReviewItem, fallback: string) {
  return proposal.title ?? proposal.currentPage?.title ?? fallback;
}

function ComparedText({ value, empty }: { value: string | null; empty?: string }) {
  return value ? (
    <pre className="whitespace-pre-wrap break-words font-sans text-sm">{value}</pre>
  ) : (
    <p className="text-subdued text-sm">{empty}</p>
  );
}

function Comparison({ label, current, proposed }: { label: string; current: ReactNode; proposed: ReactNode }) {
  const t = useTranslations();
  return (
    <section aria-label={label} className="grid gap-2">
      <h3 className="text-sm font-medium">{label}</h3>

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="min-w-0 rounded-md border border-border p-3" data-wiki-proposal-side="current">
          <p className="text-subdued mb-1 text-xs">{t("Wiki.proposals.current")}</p>

          {current}
        </div>

        <div className="min-w-0 rounded-md border border-primary/40 p-3" data-wiki-proposal-side="proposed">
          <p className="text-subdued mb-1 text-xs">{t("Wiki.proposals.proposed")}</p>

          {proposed}
        </div>
      </div>
    </section>
  );
}

const ProposalPreview = observer(({ proposal }: { proposal: WikiPageProposalReviewItem }) => {
  const t = useTranslations();
  const page = proposal.currentPage;
  const notYetCreated = t("Wiki.proposals.notYetCreated");
  const missing = t("Wiki.proposals.pageMissing");
  const currentEmpty = proposal.action === "create" ? notYetCreated : missing;
  const proposedTitle = proposal.action === "delete" ? null : (proposal.title ?? page?.title ?? null);
  const proposedKind = proposal.action === "delete" ? null : (proposal.kind ?? page?.kind ?? null);
  const proposedWhenToUse = proposedKind === "procedure" ? (proposal.whenToUse ?? page?.whenToUse ?? null) : null;
  const proposedMarkdown = proposal.action === "delete" ? null : (proposal.markdown ?? page?.markdown ?? null);
  const deleted = t("Wiki.proposals.deleteNotice");

  return (
    <div className="grid gap-4" data-wiki-proposal-preview={proposal.id}>
      {proposal.stale && (
        <Alert color="warning" description={page ? t("Wiki.proposals.stale") : t("Wiki.proposals.pageMissing")} />
      )}

      {proposal.action === "delete" && !proposal.stale && <Alert color="danger" description={deleted} />}

      <Comparison
        current={<ComparedText empty={currentEmpty} value={page?.title ?? null} />}
        label={t("Wiki.pageTitle")}
        proposed={<ComparedText empty={deleted} value={proposedTitle} />}
      />

      {(proposedKind ?? page?.kind) !== "knowledge" && (
        <Comparison
          current={
            <ComparedText
              empty={currentEmpty}
              value={
                page
                  ? [kindLabel(t, page.kind), page.kind === "procedure" ? page.whenToUse : null]
                      .filter(Boolean)
                      .join(": ")
                  : null
              }
            />
          }
          label={t("Wiki.kind.label")}
          proposed={
            <ComparedText
              empty={deleted}
              value={[kindLabel(t, proposedKind), proposedWhenToUse].filter(Boolean).join(": ") || null}
            />
          }
        />
      )}

      <Comparison
        current={<ComparedText empty={currentEmpty} value={page?.markdown ?? null} />}
        label={t("Wiki.document")}
        proposed={<ComparedText empty={deleted} value={proposedMarkdown} />}
      />
    </div>
  );
});

const ProposalList = observer(({ store }: { store: WikiProposalsStore }) => {
  const t = useTranslations();
  const intlStore = useHydratedIntlStore();

  if (store.items.length === 0 && store.requestState === "loading") {
    return (
      <div className="flex min-h-32 items-center justify-center" role="status">
        <Spinner aria-label={t("PageState.loading")} />
      </div>
    );
  }

  if (store.items.length === 0 && store.requestState === "failed") {
    return (
      <Alert color="danger" description={t("Wiki.proposals.loadFailed")}>
        <Button className="mt-2" size="sm" variant="secondary" onClick={() => runUserAction(store.load)}>
          {t("ErrorCard.retry")}
        </Button>
      </Alert>
    );
  }

  if (store.items.length === 0)
    return <p className="text-subdued py-8 text-center text-sm">{t("Wiki.proposals.empty")}</p>;

  return (
    <ul className="grid gap-2" data-wiki-proposal-list="">
      {store.items.map((proposal) => (
        <li key={proposal.id}>
          <button
            className="flex w-full min-w-0 items-center gap-3 rounded-md border border-border p-3 text-left hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            type="button"
            onClick={() => store.select(proposal.id)}
          >
            <span className="grid min-w-0 flex-1 gap-1">
              <span className="flex min-w-0 flex-wrap items-center gap-2">
                <AppChip variant={ACTION_CHIP_COLOR[proposal.action]}>{actionLabel(t, proposal.action)}</AppChip>

                {proposal.stale && <AppChip variant="warning">{t("Wiki.proposals.staleShort")}</AppChip>}
              </span>

              <span className="truncate text-sm font-medium">{proposalTitle(proposal, t("Wiki.untitled"))}</span>

              <span className="text-subdued truncate text-xs">
                {proposal.routineName
                  ? t("Wiki.proposals.fromRoutine", { routine: proposal.routineName })
                  : t("Wiki.proposals.fromRoutineDeleted")}

                {" · "}

                {intlStore.formatNumericalShortDateTime(proposal.createdAt)}
              </span>
            </span>

            <ChevronRight aria-hidden="true" className="size-4 shrink-0 text-muted-foreground" />
          </button>
        </li>
      ))}
    </ul>
  );
});

export const WikiProposals = observer(({ store, canApply }: Props) => {
  const t = useTranslations();
  const selected = store.selected;
  const busy = store.reviewingId !== null;

  if (store.total === 0 && !store.open) return null;

  return (
    <Sheet open={store.open} onOpenChange={store.setOpen}>
      <SheetTrigger asChild>
        <Button
          aria-label={t("Wiki.proposals.entryLabel", { count: store.total })}
          data-wiki-proposals-entry=""
          size="sm"
          variant="secondary"
        >
          <Inbox aria-hidden="true" className="size-4" />

          <span className="hidden sm:inline">{t("Wiki.proposals.entry")}</span>

          <Badge className="tabular-nums" variant="info">
            {store.total}
          </Badge>
        </Button>
      </SheetTrigger>

      <SheetContent className="gap-0 sm:max-w-2xl" side="right">
        <SheetHeader>
          <SheetTitle>{t("Wiki.proposals.title")}</SheetTitle>

          <SheetDescription>{t("Wiki.proposals.description")}</SheetDescription>
        </SheetHeader>

        <SheetBody className="flex flex-col gap-4 pb-4">
          {selected ? (
            <>
              <div className="grid gap-2">
                <Button className="w-fit" size="sm" type="button" variant="ghost" onClick={() => store.select(null)}>
                  <ArrowLeft aria-hidden="true" className="size-4" />

                  {t("Wiki.proposals.back")}
                </Button>

                <div className="flex min-w-0 flex-wrap items-center gap-2">
                  <AppChip variant={ACTION_CHIP_COLOR[selected.action]}>{actionLabel(t, selected.action)}</AppChip>

                  <h2 className="min-w-0 break-words text-base font-semibold">
                    {proposalTitle(selected, t("Wiki.untitled"))}
                  </h2>
                </div>

                <p className="text-subdued text-xs">
                  {selected.routineName
                    ? t("Wiki.proposals.fromRoutine", { routine: selected.routineName })
                    : t("Wiki.proposals.fromRoutineDeleted")}
                </p>
              </div>

              <ProposalPreview proposal={selected} />
            </>
          ) : (
            <ProposalList store={store} />
          )}
        </SheetBody>

        {selected && (
          <SheetFooter className="flex-row flex-wrap items-center justify-end">
            {!canApply(selected.action) && (
              <p className="text-subdued mr-auto text-xs">{t("Wiki.proposals.needsPermission")}</p>
            )}

            <Button
              disabled={busy}
              size="sm"
              type="button"
              variant="secondary"
              onClick={() => runUserAction(() => store.reject(selected.id))}
            >
              <X aria-hidden="true" className="size-4" />

              {t("Wiki.proposals.reject")}
            </Button>

            <Button
              disabled={busy || selected.stale || !canApply(selected.action)}
              size="sm"
              type="button"
              variant={selected.action === "delete" ? "destructive" : "default"}
              onClick={() => runUserAction(() => store.approve(selected.id))}
            >
              <Check aria-hidden="true" className="size-4" />

              {t("Wiki.proposals.approve")}
            </Button>
          </SheetFooter>
        )}
      </SheetContent>
    </Sheet>
  );
});
