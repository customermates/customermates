"use client";

import type { ReviewDraft } from "@/ee/messaging/outbound/list-review-drafts.interactor";
import type { PanInfo } from "framer-motion";

import { useEffect } from "react";
import { motion, useMotionValue, useReducedMotion, useTransform } from "framer-motion";
import { observer } from "mobx-react-lite";
import { useTranslations } from "next-intl";
import { ArrowLeft, ArrowRight, LoaderCircle, Paperclip, Pencil, Send, Trash2 } from "lucide-react";

import { AppCard } from "@/components/card/app-card";
import { AppCardBody } from "@/components/card/app-card-body";
import { AppCardFooter } from "@/components/card/app-card-footer";
import { AppCardHeader } from "@/components/card/app-card-header";
import { FormFooterActions } from "@/components/forms/form-footer-actions";
import { AppModal, AppModalTitle } from "@/components/modal/app-modal";
import { Avatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { runUserAction } from "@/core/errors/report-application-error";
import { useRootStore } from "@/core/stores/root-store.provider";
import { useHydratedIntlStore } from "@/core/stores/use-hydrated-intl-store";
import { cn } from "@/core/utils/cn";
import { splitQuotedText } from "@/ee/messaging/email-quote";
import { isDraftThreadId, isEmailProvider } from "@/ee/messaging/provider";
import { getProviderIcon } from "@/ee/messaging/provider-icon";
import { deriveThreadDisplay, messageSenderName } from "@/ee/messaging/thread-display";
import { MessageText } from "@/features/messaging/message-text";

import { deckShortcutAllowed } from "./draft-review-shortcuts";

const SWIPE_DISTANCE = 120;
const SWIPE_VELOCITY = 600;
const SIGNATURE_DELIMITER = /\n-- ?(?:\n|$)/;

function historyPreview(message: ReviewDraft["history"][number]): string | null {
  const body = message.bodyText?.trim();
  const visible = body
    ? splitQuotedText(body)
        .visible.split(SIGNATURE_DELIMITER)[0]
        .replace(/\s*\n+\s*/g, " ")
        .trim()
    : "";

  return visible || message.subject?.trim() || null;
}

const DraftCard = observer(function DraftCard({ item }: { item: ReviewDraft }) {
  const t = useTranslations();
  const intlStore = useHydratedIntlStore();
  const { draftReviewStore: store } = useRootStore();
  const { draft, thread, history } = item;
  const view = deriveThreadDisplay(thread, t);
  const ProviderIcon = getProviderIcon(thread.provider);
  const email = isEmailProvider(thread.provider);
  const subject = email ? draft.subject?.trim() || thread.subject?.trim() || null : null;
  const recipientName = (email && !view.isGroup && view.displayNameSecondary) || view.displayName;
  const attachmentCount = draft.attachmentsMeta.length;

  return (
    <div className="flex min-h-0 flex-col gap-4" data-draft-review-card={draft.id}>
      <div className="flex items-center gap-3">
        <Avatar name={recipientName} size="lg" src={view.avatarUrl} />

        <div className="min-w-0 flex-1">
          <div className="flex min-w-0 items-center gap-1.5">
            <span className="truncate text-sm font-semibold">{recipientName}</span>

            <Tooltip>
              <TooltipTrigger asChild>
                <ProviderIcon
                  aria-label={t(`Common.providers.${thread.provider}`)}
                  className="text-muted-foreground size-3.5 shrink-0"
                />
              </TooltipTrigger>

              <TooltipContent>{t(`Common.providers.${thread.provider}`)}</TooltipContent>
            </Tooltip>
          </div>

          <p className="text-muted-foreground truncate text-xs">
            {isDraftThreadId(thread.unipileThreadId) ? t("Inbox.draftReview.newConversation") : null}

            {isDraftThreadId(thread.unipileThreadId) && item.accountLabel ? " · " : null}

            {item.accountLabel ? t("Inbox.draftReview.from", { account: item.accountLabel }) : null}
          </p>
        </div>
      </div>

      {history.length > 0 && (
        <ol aria-label={t("Inbox.draftReview.earlier")} className="flex flex-col gap-2">
          {history.map((message) => (
            <li key={message.id} className="text-muted-foreground text-xs">
              <p className="flex gap-1.5">
                <span className="text-foreground font-medium">
                  {message.direction === "outbound" ? t("Inbox.youPrefix") : `${messageSenderName(message) ?? ""}:`}
                </span>

                <time suppressHydrationWarning>{intlStore.formatRelativeTime(message.sentAt)}</time>
              </p>

              <p className="line-clamp-2">{historyPreview(message) ?? t("Inbox.attachmentUnsupported")}</p>
            </li>
          ))}
        </ol>
      )}

      <div className="rounded-lg border border-border-strong bg-muted/50 p-4 text-sm" data-draft-review-body="">
        {subject && <p className="mb-2 font-semibold">{subject}</p>}

        {store.editing ? (
          <Textarea
            autoFocus
            aria-label={t("Inbox.draftReview.editLabel")}
            className="max-h-64 min-h-32"
            disabled={store.busy}
            value={store.editBody}
            onChange={(event) => store.setEditBody(event.target.value)}
          />
        ) : (
          <MessageText text={draft.bodyText ?? ""} />
        )}

        {attachmentCount > 0 && (
          <p className="text-muted-foreground mt-3 flex items-center gap-1.5 text-xs">
            <Paperclip aria-hidden className="size-3" />

            {t("Inbox.draftReview.attachments", { count: attachmentCount })}
          </p>
        )}
      </div>
    </div>
  );
});

const SwipeSurface = observer(function SwipeSurface({ item }: { item: ReviewDraft }) {
  const t = useTranslations();
  const { draftReviewStore: store } = useRootStore();
  const reducedMotion = useReducedMotion();
  const x = useMotionValue(0);
  const rotate = useTransform(x, [-240, 0, 240], reducedMotion ? [0, 0, 0] : [-4, 0, 4]);
  const sendHint = useTransform(x, [24, SWIPE_DISTANCE], [0, 1]);
  const keepHint = useTransform(x, [-SWIPE_DISTANCE, -24], [1, 0]);
  const restHint = useTransform(x, [-48, -24, 24, 48], [0, 1, 1, 0]);
  const draggable = !store.editing && !store.busy;

  function settle(_event: unknown, info: PanInfo) {
    const far = Math.abs(info.offset.x) > SWIPE_DISTANCE;
    const fast = Math.abs(info.velocity.x) > SWIPE_VELOCITY && Math.abs(info.offset.x) > SWIPE_DISTANCE / 2;
    if (!far && !fast) return;
    if (info.offset.x > 0) runUserAction(() => store.send());
    else store.keep();
  }

  return (
    <>
      <motion.div
        dragSnapToOrigin
        animate={{ opacity: 1, scale: 1 }}
        className={cn("touch-pan-y", draggable && "cursor-grab active:cursor-grabbing")}
        drag={draggable ? "x" : false}
        dragConstraints={{ left: 0, right: 0 }}
        dragElastic={0.7}
        initial={reducedMotion ? false : { opacity: 0, scale: 0.98 }}
        style={{ x, rotate }}
        transition={{ duration: 0.18 }}
        onDragEnd={settle}
      >
        <DraftCard item={item} />
      </motion.div>

      <div className={cn("relative min-h-6 text-xs", store.editing && "invisible")}>
        <motion.p className="text-muted-foreground max-sm:hidden" style={{ opacity: restHint }}>
          {t("Inbox.draftReview.hint")}
        </motion.p>

        <motion.p
          aria-hidden
          className="pointer-events-none absolute inset-0 flex items-center justify-end gap-1.5 font-semibold text-success-soft-foreground"
          style={{ opacity: sendHint }}
        >
          {t("Inbox.draftReview.send")}

          <ArrowRight aria-hidden className="size-3.5" />
        </motion.p>

        <motion.p
          aria-hidden
          className="pointer-events-none absolute inset-0 flex items-center gap-1.5 font-semibold text-muted-foreground"
          style={{ opacity: keepHint }}
        >
          <ArrowLeft aria-hidden className="size-3.5" />

          {t("Inbox.draftReview.keep")}
        </motion.p>
      </div>
    </>
  );
});

export const DraftReviewDeck = observer(function DraftReviewDeck() {
  const t = useTranslations();
  const { draftReviewStore: store } = useRootStore();
  const item = store.current;
  const isOpen = store.isOpen;

  useEffect(() => {
    if (!isOpen) return;
    function onKeyDown(event: KeyboardEvent) {
      if (store.editing || store.busy || !store.current || !deckShortcutAllowed(event)) return;
      if (event.key === "ArrowRight") {
        event.preventDefault();
        runUserAction(() => store.send());
      } else if (event.key === "ArrowLeft") {
        event.preventDefault();
        store.keep();
      } else if (event.key.toLowerCase() === "e") {
        event.preventDefault();
        store.startEdit();
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [isOpen, store]);

  const reviewed = store.sentCount + store.keptCount;

  return (
    <AppModal titleInContent open={isOpen} size="xl" title={t("Inbox.draftReview.title")} onClose={store.close}>
      <AppCard data-draft-review="">
        <AppCardHeader>
          <AppModalTitle className="min-w-0 text-base font-semibold">{t("Inbox.draftReview.title")}</AppModalTitle>

          {store.status === "ready" && item && (
            <span className="text-muted-foreground shrink-0 text-xs tabular-nums" data-draft-review-progress="">
              {t("Inbox.draftReview.progress", { count: store.remaining })}
            </span>
          )}
        </AppCardHeader>

        <AppCardBody>
          {store.status === "loading" || store.status === "idle" ? (
            <div aria-busy="true" aria-label={t("PageState.loading")} className="flex flex-col gap-4" role="status">
              <Skeleton className="h-8 w-48" />

              <Skeleton className="h-36" />
            </div>
          ) : store.status === "error" ? (
            <div className="flex flex-col items-start gap-3">
              <p className="text-muted-foreground text-sm">{t("Inbox.draftReview.loadFailed")}</p>

              <Button size="sm" variant="secondary" onClick={() => runUserAction(() => store.load())}>
                {t("ErrorCard.retry")}
              </Button>
            </div>
          ) : item ? (
            <SwipeSurface key={item.draft.id} item={item} />
          ) : (
            <div className="flex flex-col gap-1 py-6" data-draft-review-done="">
              <p className="text-sm font-semibold">
                {reviewed > 0 ? t("Inbox.draftReview.doneTitle") : t("Inbox.draftReview.emptyTitle")}
              </p>

              <p className="text-muted-foreground text-sm">
                {reviewed > 0
                  ? t("Inbox.draftReview.doneBody", { sent: store.sentCount, kept: store.keptCount })
                  : t("Inbox.draftReview.emptyBody")}
              </p>
            </div>
          )}
        </AppCardBody>

        {store.status === "ready" && item ? (
          store.editing ? (
            <FormFooterActions
              dirty={store.editDirty}
              saving={store.busy}
              store={null}
              onCancel={store.cancelEdit}
              onSave={store.saveEdit}
            />
          ) : (
            <AppCardFooter className="justify-between">
              <div className="flex items-center gap-2">
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      aria-label={t("Inbox.draftReview.discard")}
                      disabled={store.busy}
                      size="icon"
                      variant="ghostDestructive"
                      onClick={() => runUserAction(() => store.discard())}
                    >
                      <Trash2 aria-hidden className="size-4" />
                    </Button>
                  </TooltipTrigger>

                  <TooltipContent>{t("Inbox.draftReview.discard")}</TooltipContent>
                </Tooltip>

                <Button disabled={store.busy} variant="ghost" onClick={store.startEdit}>
                  <Pencil aria-hidden className="size-4" />

                  {t("Inbox.compose.draftEdit")}
                </Button>
              </div>

              <div className="flex items-center gap-2 max-md:*:flex-1">
                <Button disabled={store.busy} variant="secondary" onClick={store.keep}>
                  <ArrowLeft aria-hidden className="size-4" />

                  {t("Inbox.draftReview.keep")}
                </Button>

                <Button disabled={!store.canSend} onClick={() => runUserAction(() => store.send())}>
                  {store.busy ? (
                    <LoaderCircle aria-hidden className="size-4 animate-spin" />
                  ) : (
                    <Send aria-hidden className="size-4" />
                  )}

                  {t("Inbox.draftReview.send")}

                  <ArrowRight aria-hidden className="size-4 max-sm:hidden" />
                </Button>
              </div>
            </AppCardFooter>
          )
        ) : (
          <AppCardFooter>
            <Button variant="secondary" onClick={store.close}>
              {t("Common.actions.close")}
            </Button>
          </AppCardFooter>
        )}
      </AppCard>
    </AppModal>
  );
});
