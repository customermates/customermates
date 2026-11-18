"use client";

import type { ReviewDraft } from "@/ee/messaging/outbound/list-review-drafts.interactor";
import type { PanInfo } from "framer-motion";
import type { ReactNode } from "react";

import { useEffect } from "react";
import { motion, useMotionValue, useReducedMotion, useTransform } from "framer-motion";
import { observer } from "mobx-react-lite";
import { useTranslations } from "next-intl";
import { Clock, LoaderCircle, Paperclip, Pencil, Send, Trash2 } from "lucide-react";

import { AppCard } from "@/components/card/app-card";
import { AppCardBody } from "@/components/card/app-card-body";
import { AppCardFooter } from "@/components/card/app-card-footer";
import { AppCardHeader } from "@/components/card/app-card-header";
import { FormFooterActions } from "@/components/forms/form-footer-actions";
import { AppModal, AppModalTitle } from "@/components/modal/app-modal";
import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
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
import { MessageSurface } from "@/features/messaging/message-surface";
import { MessageText } from "@/features/messaging/message-text";

import { deckShortcutAllowed } from "./draft-review-shortcuts";

const SWIPE_DISTANCE = 110;
const SWIPE_VELOCITY = 700;
const HISTORY_SHOWN = 2;
const PEEKING_CARDS = 2;
const SIGNATURE_DELIMITER = /\n-- ?(?:\n|$)/;

export function historyPreview(message: ReviewDraft["history"][number]): string | null {
  const body = message.bodyText?.trim();
  const visible = body
    ? splitQuotedText(body)
        .visible.split(SIGNATURE_DELIMITER)[0]
        .replace(/\s*\n+\s*/g, " ")
        .trim()
    : "";

  return visible || message.subject?.trim() || null;
}

function useRecipient(item: ReviewDraft) {
  const t = useTranslations();
  const view = deriveThreadDisplay(item.thread, t);
  const email = isEmailProvider(item.thread.provider);
  const name = (email && !view.isGroup && view.displayNameSecondary) || view.displayName;
  const subject = email ? item.draft.subject?.trim() || item.thread.subject?.trim() || null : null;

  return { name, subject, avatarUrl: view.avatarUrl };
}

function ProviderMark({ item, className }: { item: ReviewDraft; className?: string }) {
  const t = useTranslations();
  const ProviderIcon = getProviderIcon(item.thread.provider);
  const label = t(`Common.providers.${item.thread.provider}`);

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <ProviderIcon aria-label={label} className={cn("size-3.5 shrink-0", className)} />
      </TooltipTrigger>

      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  );
}

function RecipientHeader({ item }: { item: ReviewDraft }) {
  const t = useTranslations();
  const { name, avatarUrl } = useRecipient(item);
  const newConversation = isDraftThreadId(item.thread.unipileThreadId);

  return (
    <div className="flex min-w-0 items-center gap-3 p-4 pb-3">
      <Avatar name={name} size="lg" src={avatarUrl} />

      <div className="min-w-0 flex-1">
        <div className="flex min-w-0 items-center gap-1.5">
          <span className="truncate text-sm font-semibold">{name}</span>

          <ProviderMark item={item} />
        </div>

        <p className="text-muted-foreground truncate text-xs">
          {newConversation ? t("Inbox.draftReview.newConversation") : null}

          {newConversation && item.accountLabel ? " · " : null}

          {item.accountLabel ? t("Inbox.draftReview.from", { account: item.accountLabel }) : null}
        </p>
      </div>
    </div>
  );
}

const HistoryBubble = observer(function HistoryBubble({
  item,
  message,
}: {
  item: ReviewDraft;
  message: ReviewDraft["history"][number];
}) {
  const t = useTranslations();
  const intlStore = useHydratedIntlStore();
  const { userStore } = useRootStore();
  const { name, avatarUrl } = useRecipient(item);
  const outbound = message.direction === "outbound";
  const me = userStore.user;
  const sender = outbound ? t("Inbox.senderYou") : (messageSenderName(message) ?? name);

  return (
    <li className={cn("flex gap-2", outbound ? "flex-row-reverse" : "flex-row")}>
      <div className="flex shrink-0 flex-col justify-end pb-5">
        <Avatar
          name={outbound ? [me?.firstName, me?.lastName] : sender}
          src={outbound ? (me?.avatarUrl ?? undefined) : avatarUrl}
        />
      </div>

      <div className={cn("flex min-w-0 max-w-[85%] flex-col gap-1", outbound ? "items-end" : "items-start")}>
        <MessageSurface isEmail={false} isOutbound={outbound}>
          <div className="px-3 py-2">
            <p className="line-clamp-2">{historyPreview(message) ?? t("Inbox.attachmentUnsupported")}</p>
          </div>
        </MessageSurface>

        <p className="flex items-center gap-1.5 px-1">
          <span className="text-foreground/80 max-w-48 truncate text-xs font-medium">{sender}</span>

          <time suppressHydrationWarning className="text-muted-foreground text-[11px] whitespace-nowrap">
            {intlStore.formatRelativeTime(message.sentAt)}
          </time>
        </p>
      </div>
    </li>
  );
});

const DraftBubble = observer(function DraftBubble({ item }: { item: ReviewDraft }) {
  const t = useTranslations();
  const { draftReviewStore: store } = useRootStore();
  const { subject } = useRecipient(item);
  const attachmentCount = item.draft.attachmentsMeta.length;

  return (
    <div className="flex justify-end pl-8">
      <MessageSurface isEmail isOutbound className="border-primary/30 w-full border border-dashed">
        <div className="flex flex-col gap-2 px-3.5 py-3" data-draft-review-body="">
          {(subject || store.editing) && (
            <div className="flex items-center justify-between gap-2">
              {subject ? <span className="min-w-0 truncate font-semibold">{subject}</span> : <span />}

              <Badge variant="secondary">{t("Inbox.draftReview.draftBadge")}</Badge>
            </div>
          )}

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
            <div>
              {!subject && (
                <Badge className="float-end ms-2 mb-1" variant="secondary">
                  {t("Inbox.draftReview.draftBadge")}
                </Badge>
              )}

              <MessageText text={item.draft.bodyText ?? ""} />
            </div>
          )}

          {attachmentCount > 0 && (
            <p className="text-muted-foreground flex items-center gap-1.5 text-xs">
              <Paperclip aria-hidden className="size-3" />

              {t("Inbox.draftReview.attachments", { count: attachmentCount })}
            </p>
          )}
        </div>
      </MessageSurface>
    </div>
  );
});

function SwipeStamp({ children, tone }: { children: ReactNode; tone: "send" | "keep" }) {
  return (
    <span
      className={cn(
        "bg-background flex items-center gap-2 rounded-lg border-2 px-4 py-2 text-base font-semibold shadow-sm",
        tone === "send"
          ? "border-success/40 text-success-soft-foreground -rotate-6"
          : "border-border-strong text-muted-foreground rotate-6",
      )}
    >
      {children}
    </span>
  );
}

const DraftCard = observer(function DraftCard({ item }: { item: ReviewDraft }) {
  const t = useTranslations();
  const { draftReviewStore: store } = useRootStore();
  const reducedMotion = useReducedMotion();
  const x = useMotionValue(0);
  const rotate = useTransform(x, [-260, 0, 260], reducedMotion ? [0, 0, 0] : [-6, 0, 6]);
  const sendOpacity = useTransform(x, [20, SWIPE_DISTANCE], [0, 1]);
  const keepOpacity = useTransform(x, [-SWIPE_DISTANCE, -20], [1, 0]);
  const draggable = !store.editing && !store.busy;

  function settle(_event: unknown, info: PanInfo) {
    const far = Math.abs(info.offset.x) > SWIPE_DISTANCE;
    const fast = Math.abs(info.velocity.x) > SWIPE_VELOCITY && Math.abs(info.offset.x) > SWIPE_DISTANCE / 2;
    if (!far && !fast) return;
    if (info.offset.x > 0) runUserAction(() => store.send());
    else store.keep();
  }

  return (
    <motion.div
      dragSnapToOrigin
      animate={{ opacity: 1, y: 0 }}
      className={cn("relative touch-pan-y", draggable && "cursor-grab active:cursor-grabbing")}
      data-draft-review-card={item.draft.id}
      drag={draggable ? "x" : false}
      dragConstraints={{ left: 0, right: 0 }}
      dragElastic={0.8}
      initial={reducedMotion ? false : { opacity: 0, y: 8 }}
      style={{ x, rotate }}
      transition={{ duration: 0.18 }}
      onDragEnd={settle}
    >
      <div className="bg-card border-border-strong overflow-hidden rounded-2xl border shadow-md">
        <RecipientHeader item={item} />

        <div className="bg-muted/60 flex flex-col gap-3 p-4">
          {item.history.length > 0 && (
            <ol aria-label={t("Inbox.draftReview.earlier")} className="flex flex-col gap-3">
              {item.history.slice(-HISTORY_SHOWN).map((message) => (
                <HistoryBubble key={message.id} item={item} message={message} />
              ))}
            </ol>
          )}

          <DraftBubble item={item} />
        </div>
      </div>

      <motion.div
        aria-hidden
        className="bg-success/10 border-success/40 pointer-events-none absolute inset-0 z-20 flex items-start justify-center rounded-2xl border-2 pt-24"
        style={{ opacity: sendOpacity }}
      >
        <SwipeStamp tone="send">
          <Send className="size-4" />

          {t("Inbox.draftReview.send")}
        </SwipeStamp>
      </motion.div>

      <motion.div
        aria-hidden
        className="bg-foreground/5 border-border-strong pointer-events-none absolute inset-0 z-20 flex items-start justify-center rounded-2xl border-2 pt-24"
        style={{ opacity: keepOpacity }}
      >
        <SwipeStamp tone="keep">
          <Clock className="size-4" />

          {t("Inbox.draftReview.keep")}
        </SwipeStamp>
      </motion.div>
    </motion.div>
  );
});

const CardStack = observer(function CardStack({ item }: { item: ReviewDraft }) {
  const { draftReviewStore: store } = useRootStore();
  const peeking = store.queue.slice(1, 1 + PEEKING_CARDS);

  return (
    <div className="relative">
      {peeking.map((entry, index) => (
        <div
          key={entry.draft.id}
          aria-hidden
          className="bg-card border-border absolute inset-x-0 top-0 h-full rounded-2xl border shadow-xs"
          style={{
            transform: `translateY(${(index + 1) * 10}px) scale(${1 - (index + 1) * 0.04})`,
            transformOrigin: "bottom center",
            opacity: 1 - (index + 1) * 0.3,
          }}
        />
      ))}

      <DraftCard key={item.draft.id} item={item} />
    </div>
  );
});

function RoundAction({
  children,
  label,
  onClick,
  size = "lg",
  variant = "secondary",
  disabled = false,
}: {
  children: ReactNode;
  label: string;
  onClick: () => void;
  size?: "sm" | "lg";
  variant?: "default" | "secondary" | "ghostDestructive";
  disabled?: boolean;
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          aria-label={label}
          className={cn("rounded-full", size === "lg" ? "size-14 shadow-sm" : "size-10")}
          disabled={disabled}
          variant={variant}
          onClick={onClick}
        >
          {children}
        </Button>
      </TooltipTrigger>

      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  );
}

const DecisionButtons = observer(function DecisionButtons() {
  const t = useTranslations();
  const { draftReviewStore: store } = useRootStore();

  return (
    <div className="flex items-center justify-center gap-4">
      <RoundAction
        disabled={store.busy}
        label={t("Inbox.draftReview.discard")}
        size="sm"
        variant="ghostDestructive"
        onClick={() => runUserAction(() => store.discard())}
      >
        <Trash2 aria-hidden className="size-4" />
      </RoundAction>

      <RoundAction disabled={store.busy} label={t("Inbox.draftReview.keep")} onClick={store.keep}>
        <Clock aria-hidden className="size-5" />
      </RoundAction>

      <RoundAction
        disabled={!store.canSend}
        label={t("Inbox.draftReview.send")}
        variant="default"
        onClick={() => runUserAction(() => store.send())}
      >
        {store.busy ? (
          <LoaderCircle aria-hidden className="size-5 animate-spin" />
        ) : (
          <Send aria-hidden className="size-5" />
        )}
      </RoundAction>

      <RoundAction disabled={store.busy} label={t("Inbox.compose.draftEdit")} size="sm" onClick={store.startEdit}>
        <Pencil aria-hidden className="size-4" />
      </RoundAction>
    </div>
  );
});

function QueueRow({ item, active, onSelect }: { item: ReviewDraft; active: boolean; onSelect: () => void }) {
  const t = useTranslations();
  const { name, avatarUrl } = useRecipient(item);

  return (
    <li>
      <button
        aria-current={active ? "true" : undefined}
        className={cn(
          "flex w-full items-center gap-3 rounded-lg p-2.5 text-left transition-colors motion-reduce:transition-none",
          active ? "bg-selected" : "hover:bg-accent",
        )}
        type="button"
        onClick={onSelect}
      >
        <Avatar name={name} size="lg" src={avatarUrl} />

        <span className="min-w-0 flex-1">
          <span className="flex min-w-0 items-center gap-1.5">
            <span className="truncate text-sm font-medium">{name}</span>

            <ProviderMark className="text-muted-foreground size-3" item={item} />
          </span>

          <span className="text-muted-foreground mt-0.5 line-clamp-2 text-xs">
            <span className="font-semibold">{t("Inbox.draftReview.draftBadge")}: </span>

            {historyPreview(item.draft) ?? ""}
          </span>
        </span>
      </button>
    </li>
  );
}

const DraftQueue = observer(function DraftQueue() {
  const t = useTranslations();
  const { draftReviewStore: store } = useRootStore();

  return (
    <ol
      aria-label={t("Inbox.draftReview.queue")}
      className="flex flex-col gap-1 max-md:hidden"
      data-draft-review-queue=""
    >
      {store.queue.map((entry, index) => (
        <QueueRow
          key={entry.draft.id}
          active={index === 0}
          item={entry}
          onSelect={() => store.bringToFront(entry.draft.id)}
        />
      ))}
    </ol>
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
  const reviewing = store.status === "ready" && item !== null;

  return (
    <AppModal
      titleInContent
      open={isOpen}
      size={reviewing ? "3xl" : "lg"}
      title={t("Inbox.draftReview.title")}
      onClose={store.close}
    >
      <AppCard data-draft-review="">
        <AppCardHeader>
          <AppModalTitle className="min-w-0 text-base font-semibold">{t("Inbox.draftReview.title")}</AppModalTitle>

          {reviewing && (
            <span className="text-muted-foreground shrink-0 text-xs tabular-nums" data-draft-review-progress="">
              {t("Inbox.draftReview.progress", { count: store.remaining })}
            </span>
          )}
        </AppCardHeader>

        <AppCardBody>
          {store.status === "loading" || store.status === "idle" ? (
            <div aria-busy="true" aria-label={t("PageState.loading")} className="flex flex-col gap-4" role="status">
              <Skeleton className="h-8 w-48" />

              <Skeleton className="h-48 rounded-2xl" />
            </div>
          ) : store.status === "error" ? (
            <div className="flex flex-col items-start gap-3">
              <p className="text-muted-foreground text-sm">{t("Inbox.draftReview.loadFailed")}</p>

              <Button size="sm" variant="secondary" onClick={() => runUserAction(() => store.load())}>
                {t("ErrorCard.retry")}
              </Button>
            </div>
          ) : item ? (
            <div className="grid min-h-0 gap-6 md:grid-cols-[220px_minmax(0,1fr)]">
              <DraftQueue />

              <div className="flex min-w-0 flex-col gap-8 pb-3">
                <CardStack item={item} />

                {!store.editing && (
                  <>
                    <DecisionButtons />

                    <p className="text-muted-foreground text-center text-xs max-sm:hidden">
                      {t("Inbox.draftReview.hint")}
                    </p>
                  </>
                )}
              </div>
            </div>
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

        {reviewing && store.editing ? (
          <FormFooterActions
            dirty={store.editDirty}
            saving={store.busy}
            store={null}
            onCancel={store.cancelEdit}
            onSave={store.saveEdit}
          />
        ) : reviewing ? null : (
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
