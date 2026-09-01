"use client";

import { useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { observer } from "mobx-react-lite";
import { Send, Loader2, Check, ChevronDown, Paperclip, Smile } from "lucide-react";
import { Action, Resource } from "@/generated/prisma";

import type { MessagingProvider } from "@/generated/prisma";
import type { NewThreadTarget } from "./thread-compose.store";
import type { LinkedinProduct } from "@/ee/messaging/provider";

import { LINKEDIN_PRODUCTS } from "@/ee/messaging/provider";
import { useHydratedIntlStore } from "@/core/stores/use-hydrated-intl-store";

import { attachmentSubtitle, describeFile, downloadLocalFile } from "./attachment-classify";
import { AttachmentRow } from "./attachment-row";
import { AppChip } from "@/components/chip/app-chip";
import { AppForm } from "@/components/forms/form-context";
import { FormInput } from "@/components/forms/form-input";
import { FormInputChips } from "@/components/forms/form-input-chips";
import { FormTextarea } from "@/components/forms/form-textarea";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { useRootStore } from "@/core/stores/root-store.provider";

import { ComposerSignature } from "./composer-signature";
import { runUserAction } from "@/core/errors/report-application-error";

const COMPOSER_EMOJIS = [
  "😀",
  "😁",
  "😂",
  "🤣",
  "😊",
  "😍",
  "😘",
  "😎",
  "🤔",
  "😅",
  "😉",
  "🙃",
  "😴",
  "🥳",
  "😇",
  "🤯",
  "👍",
  "👎",
  "👏",
  "🙌",
  "🙏",
  "💪",
  "🤝",
  "👀",
  "🔥",
  "✨",
  "🎉",
  "❤️",
  "💯",
  "✅",
  "❌",
  "⚡",
  "🚀",
  "💡",
  "📈",
  "⭐",
  "💬",
  "👋",
  "🫶",
  "🤞",
];

const LINKEDIN_PRODUCT_LABELS: Record<LinkedinProduct, string> = {
  classic: "Classic",
  sales_navigator: "Sales Navigator InMail",
  recruiter: "Recruiter InMail",
};

type Props = {
  provider: MessagingProvider;
  threadId?: string;
  defaultSubject?: string | null;
  defaultRecipients?: string[];
  defaultCc?: string[];
  bare?: boolean;
  newThreadTarget?: NewThreadTarget | null;
};

export const ThreadReplyComposer = observer(
  ({ threadId, provider, defaultSubject, defaultRecipients, defaultCc, bare, newThreadTarget }: Props) => {
    const t = useTranslations();
    const intlStore = useHydratedIntlStore();
    const rootStore = useRootStore();
    const { userStore, threadComposeStore, connectedAccountsStore } = rootStore;
    const fileInputRef = useRef<HTMLInputElement>(null);
    const initializedThreadId = useRef<string | null>(null);
    const [emojiOpen, setEmojiOpen] = useState(false);

    function insertEmoji(emoji: string) {
      const el = document.getElementById("inbox-reply-input") as HTMLTextAreaElement | null;
      const current = (threadComposeStore.getValue("body") as string | undefined) ?? "";
      const start = el?.selectionStart ?? current.length;
      const end = el?.selectionEnd ?? current.length;

      threadComposeStore.onChange("body", current.slice(0, start) + emoji + current.slice(end));
      setEmojiOpen(false);

      requestAnimationFrame(() => {
        const node = document.getElementById("inbox-reply-input") as HTMLTextAreaElement | null;
        if (!node) return;

        node.focus();
        const caret = start + emoji.length;
        node.setSelectionRange(caret, caret);
      });
    }

    useEffect(() => {
      if (!threadId) return;
      if (initializedThreadId.current === threadId) return;
      initializedThreadId.current = threadId;
      if (threadComposeStore.form.threadId === threadId) return;
      if (newThreadTarget) {
        threadComposeStore.initializeNewThread({ provider, ...newThreadTarget });
        return;
      }
      threadComposeStore.initialize({
        provider,
        threadId,
        defaultSubject,
        defaultRecipients,
        defaultCc,
      });
    }, [threadComposeStore, provider, threadId, defaultSubject, defaultRecipients, defaultCc, newThreadTarget]);

    function handleKeyDown(event: React.KeyboardEvent<HTMLTextAreaElement>) {
      if ((event.metaKey || event.ctrlKey) && event.key === "Enter") {
        event.preventDefault();
        runUserAction(() => threadComposeStore.send());
      }
    }

    if (!userStore.can(Resource.inboxMessages, Action.create)) return null;

    const { isLoading, isEmail, isLinkedin, isNewThread, showCcBcc, editingDraftId, attachments } = threadComposeStore;
    const signatureAccountId = isNewThread
      ? (threadComposeStore.newThreadTarget?.connectedAccountId ?? null)
      : (rootStore.messagingThreadDetailStore.thread?.connectedAccountId ?? null);
    const linkedinProduct = threadComposeStore.form.linkedinProduct;

    const senders = isNewThread ? connectedAccountsStore.usableSendersFor(provider) : [];
    const activeSender =
      senders.find((account) => account.id === threadComposeStore.newThreadTarget?.connectedAccountId) ?? senders[0];
    const senderProducts = activeSender?.linkedinProducts ?? [];
    const availableProducts = senderProducts.length
      ? LINKEDIN_PRODUCTS.filter((product) => senderProducts.includes(product))
      : LINKEDIN_PRODUCTS;
    const senderLabel = (account: (typeof senders)[number]) => {
      const name = account.displayName?.trim();
      if (name && account.emailAddress && name !== account.emailAddress) return `${name} · ${account.emailAddress}`;
      return account.emailAddress ?? name ?? t("Common.unnamed");
    };

    const form = (
      <AppForm className="flex flex-col" store={threadComposeStore} onSubmit={threadComposeStore.send}>
        {senders.length > 1 && activeSender && (
          <div className="border-border flex items-center gap-2 border-b px-3 py-1">
            <span className="text-muted-foreground w-8 shrink-0 text-xs font-medium">{t("Inbox.compose.from")}</span>

            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  className="focus-visible:ring-ring/50 min-w-0 rounded-md outline-none focus-visible:ring-[3px]"
                  type="button"
                >
                  <AppChip interactive endContent={<ChevronDown className="size-3" />} variant="secondary">
                    {senderLabel(activeSender)}
                  </AppChip>
                </button>
              </DropdownMenuTrigger>

              <DropdownMenuContent align="start">
                {senders.map((account) => (
                  <DropdownMenuItem
                    key={account.id}
                    onSelect={() => threadComposeStore.setNewThreadAccount(account.id)}
                  >
                    <Check className={account.id === activeSender.id ? "size-4" : "size-4 opacity-0"} />

                    {senderLabel(account)}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        )}

        {isLinkedin && isNewThread && (
          <>
            {availableProducts.length > 1 && (
              <div className="border-border flex items-center gap-2 border-b px-3 py-1">
                <span className="text-muted-foreground shrink-0 text-xs font-medium">{t("Inbox.compose.sendAs")}</span>

                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <button
                      className="focus-visible:ring-ring/50 min-w-0 rounded-md outline-none focus-visible:ring-[3px]"
                      type="button"
                    >
                      <AppChip interactive endContent={<ChevronDown className="size-3" />} variant="secondary">
                        {LINKEDIN_PRODUCT_LABELS[linkedinProduct]}
                      </AppChip>
                    </button>
                  </DropdownMenuTrigger>

                  <DropdownMenuContent align="start">
                    {availableProducts.map((product) => (
                      <DropdownMenuItem
                        key={product}
                        onSelect={() => threadComposeStore.onChange("linkedinProduct", product)}
                      >
                        <Check className={product === linkedinProduct ? "size-4" : "size-4 opacity-0"} />

                        {LINKEDIN_PRODUCT_LABELS[product]}
                      </DropdownMenuItem>
                    ))}
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            )}

            {linkedinProduct !== "classic" && (
              <>
                <FormInput
                  className="h-9 rounded-none border-0 bg-transparent px-3 text-sm shadow-none focus-visible:ring-0"
                  containerClassName="border-border w-full border-b"
                  id="subject"
                  label={null}
                  placeholder={t("Inbox.compose.inmailSubjectPlaceholder")}
                />

                {linkedinProduct === "recruiter" && (
                  <FormInput
                    className="h-9 rounded-none border-0 bg-transparent px-3 text-sm shadow-none focus-visible:ring-0"
                    containerClassName="border-border w-full border-b"
                    id="inmailSignature"
                    label={null}
                    placeholder={t("Inbox.compose.inmailSignaturePlaceholder")}
                  />
                )}
              </>
            )}
          </>
        )}

        {isEmail && (
          <>
            <FormInput
              className="h-9 rounded-none border-0 bg-transparent px-3 text-sm shadow-none focus-visible:ring-0"
              containerClassName="border-border w-full border-b"
              id="subject"
              label={null}
              placeholder={t("Inbox.compose.subjectPlaceholder")}
            />

            {!isNewThread && (
              <div className="border-border flex items-center gap-2 border-b px-3 py-1">
                <span className="text-muted-foreground w-8 shrink-0 text-xs font-medium">
                  {t("Inbox.compose.toLabel")}
                </span>

                <FormInputChips
                  arrayMode
                  className="min-h-7 border-0 bg-transparent p-0 text-sm shadow-none focus-within:ring-0"
                  containerClassName="flex-1"
                  id="recipients"
                  label={null}
                />
              </div>
            )}

            {showCcBcc && (
              <div className="border-border flex flex-col border-b">
                <div className="flex items-center gap-2 px-3 py-1">
                  <span className="text-muted-foreground w-8 shrink-0 text-xs font-medium">
                    {t("Inbox.compose.ccLabel")}
                  </span>

                  <FormInputChips
                    arrayMode
                    className="min-h-7 border-0 bg-transparent p-0 text-sm shadow-none focus-within:ring-0"
                    containerClassName="flex-1"
                    id="cc"
                    label={null}
                  />
                </div>

                <div className="border-border flex items-center gap-2 border-t px-3 py-1">
                  <span className="text-muted-foreground w-8 shrink-0 text-xs font-medium">
                    {t("Inbox.compose.bccLabel")}
                  </span>

                  <FormInputChips
                    arrayMode
                    className="min-h-7 border-0 bg-transparent p-0 text-sm shadow-none focus-within:ring-0"
                    containerClassName="flex-1"
                    id="bcc"
                    label={null}
                  />
                </div>
              </div>
            )}
          </>
        )}

        <FormTextarea
          className="max-h-[calc(0.4*var(--viewport-block))] min-h-[56px] resize-none border-0 bg-transparent px-3 pt-2.5 text-sm shadow-none focus-visible:ring-0"
          containerClassName="w-full"
          id="body"
          inputId="inbox-reply-input"
          label={null}
          placeholder={isEmail ? t("Inbox.compose.writeReply") : t("Inbox.compose.typeMessage")}
          onKeyDown={handleKeyDown}
        />

        {attachments.length > 0 && (
          <div className="flex flex-col gap-1.5 px-3 pb-1.5">
            {attachments.map((file, index) => {
              const { Icon: FileTypeIcon, accent } = describeFile({
                mime: file.type,
                fileName: file.name,
              });
              return (
                <AttachmentRow
                  key={`${file.name}-${index}`}
                  accent={accent}
                  fileIcon={FileTypeIcon}
                  name={file.name}
                  removeLabel={t("Inbox.compose.attachRemove")}
                  subtitle={attachmentSubtitle(
                    t,
                    {
                      mime: file.type,
                      fileName: file.name,
                      size: file.size,
                    },
                    (value, options) => intlStore.formatNumber(value, options),
                  )}
                  onOpen={() => downloadLocalFile(file)}
                  onRemove={() => threadComposeStore.removeAttachment(index)}
                />
              );
            })}
          </div>
        )}

        <ComposerSignature connectedAccountId={signatureAccountId} />

        <div className="flex items-center justify-between gap-2 px-2 pt-0.5 pb-1.5">
          <div className="flex items-center gap-0.5">
            <input
              ref={fileInputRef}
              multiple
              className="hidden"
              type="file"
              onChange={(event) => {
                threadComposeStore.addAttachments(Array.from(event.target.files ?? []));
                event.target.value = "";
              }}
            />

            <Button
              aria-label={t("Inbox.compose.attachFiles")}
              size="icon-sm"
              type="button"
              variant="secondary"
              onClick={() => fileInputRef.current?.click()}
            >
              <Paperclip className="size-4" />
            </Button>

            <Popover open={emojiOpen} onOpenChange={setEmojiOpen}>
              <PopoverTrigger asChild>
                <Button aria-label={t("Inbox.compose.emojiPicker")} size="icon-sm" type="button" variant="secondary">
                  <Smile className="size-4" />
                </Button>
              </PopoverTrigger>

              <PopoverContent align="start" className="w-auto p-1.5">
                <div className="grid grid-cols-8 gap-0.5">
                  {COMPOSER_EMOJIS.map((emoji) => (
                    <button
                      key={emoji}
                      aria-label={emoji}
                      className="hover:bg-accent flex size-8 items-center justify-center rounded-md text-lg transition-[background-color,transform] active:scale-[0.97] motion-reduce:transition-none"
                      type="button"
                      onClick={() => insertEmoji(emoji)}
                    >
                      {emoji}
                    </button>
                  ))}
                </div>
              </PopoverContent>
            </Popover>

            {isEmail && (
              <Button size="sm" type="button" variant="secondary" onClick={threadComposeStore.toggleCcBcc}>
                {t("Inbox.compose.ccBccToggle")}
              </Button>
            )}
          </div>

          <div className="flex items-stretch">
            <Button
              className="rounded-r-none pr-2.5"
              disabled={isLoading}
              id="inbox-reply-send"
              size="sm"
              type="submit"
            >
              {isLoading ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />}

              <span>{t("Inbox.compose.send")}</span>
            </Button>

            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  aria-label={t("Inbox.compose.moreSendOptions")}
                  className="border-primary-foreground/20 rounded-l-none border-l px-1.5"
                  disabled={isLoading}
                  size="sm"
                  type="button"
                >
                  <ChevronDown className="size-4" />
                </Button>
              </DropdownMenuTrigger>

              <DropdownMenuContent align="end" className="min-w-40">
                <DropdownMenuItem onSelect={() => runUserAction(() => threadComposeStore.saveDraft())}>
                  {editingDraftId ? t("Inbox.compose.updateDraft") : t("Inbox.compose.saveDraft")}
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
      </AppForm>
    );

    if (bare) return form;

    return (
      <div className="bg-background shrink-0 px-4 pt-2 pb-4">
        <div className="bg-input-background focus-within:ring-ring/50 flex flex-col rounded-xl border border-input shadow-xs transition-[color,box-shadow] focus-within:ring-[3px] focus-within:ring-inset">
          {form}
        </div>
      </div>
    );
  },
);
